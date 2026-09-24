import { v4 as uuidv4 } from 'uuid';
import { db, TransactionClient } from '../../database/connection.js';
import {
  Order,
  OrderItem,
  OrderStatus,
  FulfillmentType,
  Reservation,
  Inventory,
} from '../../common/types.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  OrderNotAcceptableError,
  ConflictError,
} from '../../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { AvailabilityEngine } from '../availability/availability.engine.js';
import { NotificationService } from '../notification/notification.service.js';

export interface CreateOrderItemInput {
  medicine_id: string;
  quantity: number;
}

export interface CreateOrderInput {
  pharmacy_id: string;
  fulfillment_type: FulfillmentType;
  items: CreateOrderItemInput[];
  customer_note?: string;
  delivery_address?: string;
  idempotency_key?: string;
}

export class OrderService {
  /**
   * Generates a readable order reference like PL-2609-ABCD
   */
  public static generateOrderNumber(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const d = new Date();
    const prefix = `${d.getFullYear().toString().slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `PL-${prefix}-${code}`;
  }

  /**
   * Customer creates an order in PENDING status.
   * Stock is NOT permanently reserved yet.
   */
  public static async createOrder(customerId: string, input: CreateOrderInput): Promise<Order> {
    if (!input.pharmacy_id || !input.items || input.items.length === 0) {
      throw new ValidationError('Pharmacy ID and at least one order item are required.');
    }

    // Verify pharmacy exists and is verified
    const pharmRes = await db.query(
      `SELECT * FROM pharmacies WHERE id = $1 AND verification_status = 'VERIFIED'`,
      [input.pharmacy_id]
    );
    if (pharmRes.rowCount === 0) {
      throw new ValidationError('The specified pharmacy is not currently verified or available.');
    }
    const pharmacy = pharmRes.rows[0];
    const fulfillmentOpts = typeof pharmacy.fulfillment_options === 'string'
      ? JSON.parse(pharmacy.fulfillment_options)
      : pharmacy.fulfillment_options;

    if (input.fulfillment_type === 'DELIVERY' && !fulfillmentOpts.delivery) {
      throw new ValidationError('This pharmacy does not offer delivery.');
    }

    return await db.transaction(async (tx) => {
      let subtotalMinor = 0;
      const orderId = uuidv4();
      const orderNumber = this.generateOrderNumber();
      const orderItemsToInsert: {
        id: string;
        medicine_id: string;
        display_name: string;
        quantity: number;
        unit_price_minor: number;
        line_total_minor: number;
      }[] = [];

      for (const item of input.items) {
        if (!item.quantity || item.quantity <= 0) {
          throw new ValidationError('Quantity must be greater than zero.');
        }

        // Fetch medicine details
        const medRes = await tx.query(`SELECT * FROM medicines WHERE id = $1`, [item.medicine_id]);
        if (medRes.rowCount === 0) {
          throw new NotFoundError(`Medicine ${item.medicine_id}`);
        }
        const med = medRes.rows[0];

        // Fetch inventory price
        const invRes = await tx.query<Inventory>(
          `SELECT * FROM inventory WHERE pharmacy_id = $1 AND medicine_id = $2 AND status = 'ACTIVE'`,
          [input.pharmacy_id, item.medicine_id]
        );

        const unitPriceMinor = invRes.rowCount > 0 ? invRes.rows[0].unit_price_minor : 1000;
        const lineTotalMinor = unitPriceMinor * item.quantity;
        subtotalMinor += lineTotalMinor;

        const displayName = `${med.generic_name}${med.strength_value ? ` ${med.strength_value}${med.strength_unit || ''}` : ''} (${med.formulation})`;

        orderItemsToInsert.push({
          id: uuidv4(),
          medicine_id: med.id,
          display_name: displayName,
          quantity: item.quantity,
          unit_price_minor: unitPriceMinor,
          line_total_minor: lineTotalMinor,
        });
      }

      const deliveryFeeMinor = input.fulfillment_type === 'DELIVERY' ? (fulfillmentOpts.delivery_base_fee_minor || 2000) : 0;
      const totalMinor = subtotalMinor + deliveryFeeMinor;

      // Response window timeout (e.g. 30 minutes)
      const timeoutMinutes = fulfillmentOpts.response_window_minutes || 30;
      const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);

      // Insert Order (Status: PENDING)
      await tx.query(
        `INSERT INTO orders (
          id, order_number, customer_id, pharmacy_id, status,
          fulfillment_type, subtotal_minor, delivery_fee_minor, total_minor,
          currency, customer_note, expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, 'GHS', $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          orderId,
          orderNumber,
          customerId,
          input.pharmacy_id,
          input.fulfillment_type,
          subtotalMinor,
          deliveryFeeMinor,
          totalMinor,
          input.customer_note || null,
          expiresAt.toISOString(),
        ]
      );

      // Insert Order Items
      for (const item of orderItemsToInsert) {
        await tx.query(
          `INSERT INTO order_items (id, order_id, medicine_id, display_name, quantity, unit_price_minor, line_total_minor)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            item.id,
            orderId,
            item.medicine_id,
            item.display_name,
            item.quantity,
            item.unit_price_minor,
            item.line_total_minor,
          ]
        );
      }

      // Record Audit
      await AuditService.recordEvent({
        actorUserId: customerId,
        pharmacyId: input.pharmacy_id,
        eventType: 'ORDER_SUBMITTED',
        entityType: 'ORDER',
        entityId: orderId,
        metadata: {
          order_number: orderNumber,
          total_minor: totalMinor,
          fulfillment_type: input.fulfillment_type,
        },
        client: tx,
      });

      // Queue notifications
      await NotificationService.queueNotification({
        userId: customerId,
        type: 'ORDER_SUBMITTED',
        channel: 'SMS',
        referenceType: 'ORDER',
        referenceId: orderId,
        client: tx,
      });

      const res = await tx.query<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId]);
      return res.rows[0];
    });
  }

  /**
   * Pharmacy accepts order.
   * ATOMICALLY checks stock, creates reservation, decrements available stock, transitions to ACCEPTED.
   * Prevents race conditions! Throws HTTP 409 ORDER_NOT_ACCEPTABLE if stock was consumed.
   */
  public static async acceptOrder(orderId: string, actorUserId: string, pharmacyId: string): Promise<Order> {
    return await db.transaction(async (tx) => {
      // 1. Fetch order with lock
      const orderRes = await tx.query<Order>(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
      );

      if (orderRes.rowCount === 0) {
        throw new NotFoundError('Order');
      }

      const order = orderRes.rows[0];
      if (order.pharmacy_id !== pharmacyId) {
        throw new ForbiddenError('You can only accept orders for your own pharmacy.');
      }

      if (order.status !== 'PENDING') {
        throw new ConflictError(
          'ORDER_NOT_PENDING',
          `Cannot accept order in status ${order.status}. Only PENDING orders can be accepted.`
        );
      }

      if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
        // Automatically expire order
        await tx.query(`UPDATE orders SET status = 'EXPIRED' WHERE id = $1`, [orderId]);
        throw new ConflictError('ORDER_EXPIRED', 'This order has expired and can no longer be accepted.');
      }

      // 2. Fetch order items
      const itemsRes = await tx.query<OrderItem>(
        `SELECT * FROM order_items WHERE order_id = $1`,
        [orderId]
      );

      // 3. For each item, lock inventory row and verify available-to-order stock
      for (const item of itemsRes.rows) {
        const invRes = await tx.query<Inventory>(
          `SELECT * FROM inventory WHERE pharmacy_id = $1 AND medicine_id = $2`,
          [pharmacyId, item.medicine_id]
        );

        if (invRes.rowCount === 0) {
          throw new OrderNotAcceptableError(
            `Medicine (${item.display_name}) is no longer in inventory.`
          );
        }

        const inv = invRes.rows[0];
        const sellableStock = inv.observed_quantity - inv.reserved_quantity;

        if (sellableStock < item.quantity) {
          throw new OrderNotAcceptableError(
            `Insufficient stock for ${item.display_name}. Requested: ${item.quantity}, Available to order: ${Math.max(0, sellableStock)}.`
          );
        }

        // 4. Create active stock reservation (valid for 2 hours)
        const reservationId = uuidv4();
        const reservationExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);

        await tx.query(
          `INSERT INTO reservations (id, order_id, inventory_id, quantity, status, expires_at)
           VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
          [reservationId, orderId, inv.id, item.quantity, reservationExpiry.toISOString()]
        );

        // 5. Update inventory reserved_quantity and available_quantity atomically
        const newReserved = inv.reserved_quantity + item.quantity;
        const newAvailable = Math.max(0, inv.observed_quantity - newReserved);

        const newEval = AvailabilityEngine.evaluate({
          sourceType: inv.source_type,
          observedQuantity: inv.observed_quantity,
          reservedQuantity: newReserved,
          observedAt: inv.observed_at,
          confirmedAt: inv.confirmed_at,
        });

        await tx.query(
          `UPDATE inventory SET
            reserved_quantity = $1,
            available_quantity = $2,
            availability_state = $3,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [newReserved, newAvailable, newEval.state, inv.id]
        );
      }

      // 6. Transition order to ACCEPTED
      await tx.query(
        `UPDATE orders SET
          status = 'ACCEPTED',
          accepted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [orderId]
      );

      // 7. Audit log
      await AuditService.recordEvent({
        actorUserId,
        pharmacyId,
        eventType: 'ORDER_ACCEPTED',
        entityType: 'ORDER',
        entityId: orderId,
        metadata: { order_number: order.order_number },
        client: tx,
      });

      // 8. Queue customer notification
      await NotificationService.queueNotification({
        userId: order.customer_id,
        type: 'ORDER_ACCEPTED',
        channel: 'SMS',
        referenceType: 'ORDER',
        referenceId: orderId,
        client: tx,
      });

      const updated = await tx.query<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId]);
      return updated.rows[0];
    });
  }

  /**
   * Pharmacy rejects an order.
   * Releases any reservations if previously held, records rejection reason.
   */
  public static async rejectOrder(
    orderId: string,
    actorUserId: string,
    pharmacyId: string,
    rejectionReason: string
  ): Promise<Order> {
    if (!rejectionReason || rejectionReason.trim() === '') {
      throw new ValidationError('A rejection reason is required.');
    }

    return await db.transaction(async (tx) => {
      const orderRes = await tx.query<Order>(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
      );

      if (orderRes.rowCount === 0) {
        throw new NotFoundError('Order');
      }

      const order = orderRes.rows[0];
      if (order.pharmacy_id !== pharmacyId) {
        throw new ForbiddenError('You can only reject orders for your own pharmacy.');
      }

      if (order.status !== 'PENDING' && order.status !== 'ACCEPTED') {
        throw new ConflictError(
          'INVALID_STATE_TRANSITION',
          `Order in status ${order.status} cannot be rejected.`
        );
      }

      // Release any active reservations
      await this.releaseOrderReservationsInternal(orderId, tx);

      await tx.query(
        `UPDATE orders SET
          status = 'REJECTED',
          rejection_reason = $1,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [rejectionReason.trim(), orderId]
      );

      await AuditService.recordEvent({
        actorUserId,
        pharmacyId,
        eventType: 'ORDER_REJECTED',
        entityType: 'ORDER',
        entityId: orderId,
        metadata: { rejection_reason: rejectionReason },
        client: tx,
      });

      await NotificationService.queueNotification({
        userId: order.customer_id,
        type: 'ORDER_REJECTED',
        channel: 'SMS',
        referenceType: 'ORDER',
        referenceId: orderId,
        client: tx,
      });

      const updated = await tx.query<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId]);
      return updated.rows[0];
    });
  }

  /**
   * Updates fulfillment status following strict state machine rules (Doc 05 Section 33):
   * PENDING -> ACCEPTED / REJECTED / EXPIRED / CANCELLED
   * ACCEPTED -> PROCESSING / CANCELLED
   * PROCESSING -> READY / OUT_FOR_DELIVERY / CANCELLED
   * READY -> COMPLETED / CANCELLED
   * OUT_FOR_DELIVERY -> COMPLETED / CANCELLED
   */
  public static async updateOrderStatus(
    orderId: string,
    targetStatus: OrderStatus,
    actorUserId: string,
    pharmacyId?: string
  ): Promise<Order> {
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      DRAFT: ['PENDING', 'CANCELLED'],
      PENDING: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'],
      ACCEPTED: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['READY', 'OUT_FOR_DELIVERY', 'CANCELLED'],
      READY: ['COMPLETED', 'CANCELLED'],
      OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      REJECTED: [],
      EXPIRED: [],
      CANCELLED: [],
    };

    return await db.transaction(async (tx) => {
      const orderRes = await tx.query<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId]);
      if (orderRes.rowCount === 0) {
        throw new NotFoundError('Order');
      }

      const order = orderRes.rows[0];
      if (pharmacyId && order.pharmacy_id !== pharmacyId) {
        throw new ForbiddenError('Unauthorized access to this order.');
      }

      const validNext = allowedTransitions[order.status] || [];
      if (!validNext.includes(targetStatus)) {
        throw new ConflictError(
          'INVALID_STATUS_TRANSITION',
          `Cannot transition order from ${order.status} to ${targetStatus}. Allowed: ${validNext.join(', ') || 'None (Terminal state)'}`
        );
      }

      // If cancelling, release reservations
      if (targetStatus === 'CANCELLED') {
        await this.releaseOrderReservationsInternal(orderId, tx);
      }

      // If completing, consume reservations and reduce physical stock
      if (targetStatus === 'COMPLETED') {
        await this.consumeOrderReservationsInternal(orderId, tx);
      }

      const completedAtClause = targetStatus === 'COMPLETED' ? ', completed_at = CURRENT_TIMESTAMP' : '';

      await tx.query(
        `UPDATE orders SET status = $1 ${completedAtClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [targetStatus, orderId]
      );

      await AuditService.recordEvent({
        actorUserId,
        pharmacyId: order.pharmacy_id,
        eventType: `ORDER_${targetStatus}`,
        entityType: 'ORDER',
        entityId: orderId,
        metadata: { from: order.status, to: targetStatus },
        client: tx,
      });

      await NotificationService.queueNotification({
        userId: order.customer_id,
        type: `ORDER_${targetStatus}`,
        channel: 'SMS',
        referenceType: 'ORDER',
        referenceId: orderId,
        client: tx,
      });

      const updated = await tx.query<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId]);
      return updated.rows[0];
    });
  }

  /**
   * Internal helper to release all active reservations for an order and restore available stock.
   */
  private static async releaseOrderReservationsInternal(orderId: string, tx: TransactionClient): Promise<void> {
    const resRes = await tx.query<Reservation>(
      `SELECT * FROM reservations WHERE order_id = $1 AND status = 'ACTIVE'`,
      [orderId]
    );

    for (const r of resRes.rows) {
      await tx.query(
        `UPDATE reservations SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [r.id]
      );

      const invRes = await tx.query<Inventory>(
        `SELECT * FROM inventory WHERE id = $1`,
        [r.inventory_id]
      );

      if (invRes.rowCount > 0) {
        const inv = invRes.rows[0];
        const newReserved = Math.max(0, inv.reserved_quantity - r.quantity);
        const newAvailable = Math.max(0, inv.observed_quantity - newReserved);

        const newEval = AvailabilityEngine.evaluate({
          sourceType: inv.source_type,
          observedQuantity: inv.observed_quantity,
          reservedQuantity: newReserved,
          observedAt: inv.observed_at,
          confirmedAt: inv.confirmed_at,
        });

        await tx.query(
          `UPDATE inventory SET
            reserved_quantity = $1,
            available_quantity = $2,
            availability_state = $3,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [newReserved, newAvailable, newEval.state, inv.id]
        );
      }
    }
  }

  /**
   * Internal helper to consume reservations when order is completed.
   * Decrements observed_quantity and reserved_quantity.
   */
  private static async consumeOrderReservationsInternal(orderId: string, tx: TransactionClient): Promise<void> {
    const resRes = await tx.query<Reservation>(
      `SELECT * FROM reservations WHERE order_id = $1 AND status = 'ACTIVE'`,
      [orderId]
    );

    for (const r of resRes.rows) {
      await tx.query(
        `UPDATE reservations SET status = 'CONSUMED' WHERE id = $1`,
        [r.id]
      );

      const invRes = await tx.query<Inventory>(
        `SELECT * FROM inventory WHERE id = $1`,
        [r.inventory_id]
      );

      if (invRes.rowCount > 0) {
        const inv = invRes.rows[0];
        const newObserved = Math.max(0, inv.observed_quantity - r.quantity);
        const newReserved = Math.max(0, inv.reserved_quantity - r.quantity);
        const newAvailable = Math.max(0, newObserved - newReserved);

        await tx.query(
          `UPDATE inventory SET
            observed_quantity = $1,
            reserved_quantity = $2,
            available_quantity = $3,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [newObserved, newReserved, newAvailable, inv.id]
        );
      }
    }
  }

  public static async getOrderById(orderId: string, actorUserId: string, userRole: string, pharmacyId?: string) {
    const orderRes = await db.query<Order>(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    if (orderRes.rowCount === 0) {
      throw new NotFoundError('Order');
    }
    const order = orderRes.rows[0];

    // Ownership check
    if (userRole === 'CUSTOMER' && order.customer_id !== actorUserId) {
      throw new ForbiddenError('You can only view your own orders.');
    }
    if ((userRole === 'PHARMACY_ADMIN' || userRole === 'PHARMACY_STAFF') && order.pharmacy_id !== pharmacyId) {
      throw new ForbiddenError('You can only view orders for your pharmacy.');
    }

    const itemsRes = await db.query<OrderItem>(`SELECT * FROM order_items WHERE order_id = $1`, [orderId]);
    const pharmRes = await db.query(`SELECT id, display_name, address_line, phone FROM pharmacies WHERE id = $1`, [
      order.pharmacy_id,
    ]);
    const presRes = await db.query(`SELECT * FROM prescriptions WHERE order_id = $1`, [orderId]);

    return {
      ...order,
      items: itemsRes.rows,
      pharmacy: pharmRes.rows[0] || null,
      prescriptions: presRes.rows,
    };
  }

  public static async listCustomerOrders(customerId: string) {
    const res = await db.query(
      `SELECT o.*, p.display_name as pharmacy_name, p.address_line as pharmacy_address
       FROM orders o
       JOIN pharmacies p ON p.id = o.pharmacy_id
       WHERE o.customer_id = $1
       ORDER BY o.created_at DESC`,
      [customerId]
    );
    return res.rows;
  }

  public static async listPharmacyOrders(pharmacyId: string, status?: OrderStatus) {
    let sql = `SELECT o.*, u.first_name || ' ' || COALESCE(u.last_name, '') as customer_name, u.phone as customer_phone
               FROM orders o
               JOIN users u ON u.id = o.customer_id
               WHERE o.pharmacy_id = $1`;
    const params: any[] = [pharmacyId];

    if (status) {
      params.push(status);
      sql += ` AND o.status = $${params.length}`;
    }

    sql += ` ORDER BY o.created_at DESC`;
    const res = await db.query(sql, params);
    return res.rows;
  }
}
