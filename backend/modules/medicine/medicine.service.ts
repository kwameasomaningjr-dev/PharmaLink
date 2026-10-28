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

  public static async searchMedicines(queryStr: string, limit = 100): Promise<Medicine[]> {
    if (!queryStr || queryStr.trim().length === 0) {
      return this.listMedicines(limit);
    }

    const raw = queryStr.trim();
    const normalized = this.normalizeSearchTerm(raw);
    const tokens = normalized.split(' ').filter((t) => t.length >= 3);
    const longToken = tokens.length > 0 ? tokens[0] : '';

    // Search against medicines generic_name, brand_name, and medicine_aliases with relevance ranking
    const res = await db.query(
      `SELECT m.*
       FROM medicines m
       WHERE m.status = 'ACTIVE'
         AND (
           LOWER(m.generic_name) LIKE '%' || $1 || '%'
           OR LOWER(COALESCE(m.brand_name, '')) LIKE '%' || $1 || '%'
           OR LOWER(COALESCE(m.brand_name, '')) LIKE '%' || LOWER($2) || '%'
           OR REPLACE(LOWER(COALESCE(m.brand_name, '')), '-', ' ') LIKE '%' || $1 || '%'
           OR EXISTS (
             SELECT 1 FROM medicine_aliases ma
             WHERE ma.medicine_id = m.id
               AND (ma.normalized_alias LIKE '%' || $1 || '%' OR LOWER(ma.alias) LIKE '%' || LOWER($2) || '%')
           )
           OR (
             $3 != '' AND (
               LOWER(m.generic_name) LIKE '%' || $3 || '%'
               OR LOWER(COALESCE(m.brand_name, '')) LIKE '%' || $3 || '%'
               OR EXISTS (
                 SELECT 1 FROM medicine_aliases ma2
                 WHERE ma2.medicine_id = m.id AND ma2.normalized_alias LIKE '%' || $3 || '%'
               )
             )
           )
         )
       ORDER BY
         CASE
           WHEN LOWER(m.generic_name) = $1 OR LOWER(COALESCE(m.brand_name, '')) = LOWER($2) THEN 0
           WHEN EXISTS (SELECT 1 FROM medicine_aliases ma3 WHERE ma3.medicine_id = m.id AND (ma3.normalized_alias = $1 OR LOWER(ma3.alias) = LOWER($2))) THEN 1
           WHEN LOWER(m.generic_name) LIKE $1 || '%' OR LOWER(COALESCE(m.brand_name, '')) LIKE LOWER($2) || '%' THEN 2
           ELSE 3
         END,
         m.generic_name ASC
       LIMIT $4`,
      [normalized, raw, longToken, limit || 100]
    );

    return res.rows;
  }
}
