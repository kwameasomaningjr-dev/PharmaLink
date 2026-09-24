import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/connection.js';
import { Medicine, MedicineAlias, MedicineAliasType } from '../../common/types.js';
import { ValidationError, NotFoundError } from '../../common/errors.js';

export interface CreateMedicineInput {
  generic_name: string;
  brand_name?: string;
  strength_value?: number;
  strength_unit?: string;
  formulation: string;
  pack_size?: number;
  pack_unit?: string;
  prescription_required?: boolean;
}

export class MedicineService {
  public static async createMedicine(input: CreateMedicineInput): Promise<Medicine> {
    if (!input.generic_name || !input.formulation) {
      throw new ValidationError('Generic name and formulation are required.');
    }

    const id = uuidv4();
    await db.query(
      `INSERT INTO medicines (
        id, generic_name, brand_name, strength_value, strength_unit,
        formulation, pack_size, pack_unit, prescription_required, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')`,
      [
        id,
        input.generic_name.trim(),
        input.brand_name?.trim() || null,
        input.strength_value || null,
        input.strength_unit?.trim() || null,
        input.formulation.trim(),
        input.pack_size || null,
        input.pack_unit?.trim() || null,
        Boolean(input.prescription_required),
      ]
    );

    // Automatically add default aliases for generic and brand
    await this.addAlias(id, input.generic_name, 'GENERIC');
    if (input.brand_name) {
      await this.addAlias(id, input.brand_name, 'BRAND');
    }
    if (input.strength_value && input.strength_unit) {
      await this.addAlias(id, `${input.generic_name} ${input.strength_value}${input.strength_unit}`, 'GENERIC');
      if (input.brand_name) {
        await this.addAlias(id, `${input.brand_name} ${input.strength_value}${input.strength_unit}`, 'BRAND');
      }
    }

    return (await this.getMedicineById(id))!;
  }

  public static async getMedicineById(id: string): Promise<Medicine | null> {
    const res = await db.query(`SELECT * FROM medicines WHERE id = $1`, [id]);
    if (res.rowCount === 0) return null;
    return res.rows[0];
  }

  public static async addAlias(
    medicineId: string,
    alias: string,
    aliasType: MedicineAliasType
  ): Promise<MedicineAlias> {
    const id = uuidv4();
    const normalized = this.normalizeSearchTerm(alias);

    await db.query(
      `INSERT INTO medicine_aliases (id, medicine_id, alias, alias_type, normalized_alias)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (medicine_id, normalized_alias) DO NOTHING`,
      [id, medicineId, alias.trim(), aliasType, normalized]
    );

    const res = await db.query(`SELECT * FROM medicine_aliases WHERE medicine_id = $1 AND normalized_alias = $2`, [
      medicineId,
      normalized,
    ]);
    return res.rows[0];
  }

  public static normalizeSearchTerm(term: string): string {
    return term
      .toLowerCase()
      .trim()
      .replace(/[^\w\s/]/g, '') // remove punctuation except slash for e.g. mg/5ml
      .replace(/\s+/g, ' ');
  }

  public static async listMedicines(limit = 100): Promise<Medicine[]> {
    const res = await db.query(`SELECT * FROM medicines WHERE status = 'ACTIVE' ORDER BY generic_name ASC LIMIT $1`, [
      limit,
    ]);
    return res.rows;
  }

  public static async searchMedicines(queryStr: string): Promise<Medicine[]> {
    if (!queryStr || queryStr.trim().length === 0) {
      return this.listMedicines(30);
    }

    const normalized = this.normalizeSearchTerm(queryStr);
    const tokens = normalized.split(' ').filter(Boolean);

    // Search against medicines generic_name, brand_name, and medicine_aliases
    const res = await db.query(
      `SELECT DISTINCT m.*
       FROM medicines m
       LEFT JOIN medicine_aliases ma ON ma.medicine_id = m.id
       WHERE m.status = 'ACTIVE'
         AND (
           LOWER(m.generic_name) LIKE '%' || $1 || '%'
           OR LOWER(COALESCE(m.brand_name, '')) LIKE '%' || $1 || '%'
           OR ma.normalized_alias LIKE '%' || $1 || '%'
           ${tokens.length > 1 ? `OR (LOWER(m.generic_name) LIKE '%' || $2 || '%' AND LOWER(COALESCE(m.brand_name, '')) LIKE '%' || $3 || '%')` : ''}
         )
       LIMIT 30`,
      tokens.length > 1 ? [normalized, tokens[0], tokens[1]] : [normalized]
    );

    return res.rows;
  }
}
