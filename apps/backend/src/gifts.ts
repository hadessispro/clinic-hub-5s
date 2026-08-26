import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

type JsonMap = Record<string, unknown>;
type ActorRequest = { user: AuthUser };
const managers = new Set(['admin','admin_it','superadmin','admin_marketing','support_marketing']);
const allowed = new Set([...managers, 'pg_staff']);

function requireAllowed(user: AuthUser) {
  if (!allowed.has(user.role)) throw new ForbiddenException('Tài khoản không có quyền truy cập kho quà tặng.');
}
function requireManager(user: AuthUser) {
  if (!managers.has(user.role)) throw new ForbiddenException('Chỉ Support PG hoặc quản trị viên được quản lý tồn kho.');
}
function positiveInt(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new BadRequestException(`${label} phải là số nguyên lớn hơn 0.`);
  return number;
}

@Injectable()
export class GiftsService {
  constructor(private readonly infrastructure: InfrastructureService) {}

  async overview(user: AuthUser) {
    requireAllowed(user);
    const owner = user.role === 'pg_staff' ? 'and lower(coalesce(m.pg_code,m.created_by_code))=lower($1)' : '';
    const values = user.role === 'pg_staff' ? [user.employeeCode] : [];
    const [inventory, categories, activity] = await Promise.all([
      this.infrastructure.postgres.query(
        `select i.*,coalesce(c.name,i.category) category_name,c.color category_color,
                coalesce(sum(case when m.affects_stock then case when m.movement_type in ('stock_in','return','adjustment_in') then m.quantity else -m.quantity end else 0 end),0)::int stock
         from marketing.gift_items i left join marketing.gift_categories c on c.id=i.category_id
         left join marketing.gift_stock_movements m on m.gift_item_id=i.id
         group by i.id,c.name,c.color order by i.active desc,i.name`,
      ),
      this.infrastructure.postgres.query('select * from marketing.gift_categories where active=true order by name'),
      this.infrastructure.postgres.query(
        `select count(*) filter(where m.movement_type in ('issue','legacy_issue'))::int issued_total,
                count(*) filter(where m.movement_type='issue' and (m.occurred_at at time zone 'Asia/Ho_Chi_Minh')::date=current_date)::int issued_today,
                count(distinct nullif(m.recipient_phone,'')) filter(where m.movement_type in ('issue','legacy_issue'))::int recipients
         from marketing.gift_stock_movements m where 1=1 ${owner}`, values,
      ),
    ]);
    const items = inventory.rows;
    return { data: { items, categories: categories.rows, summary: {
      activeItems: items.filter((row: JsonMap) => row.active).length,
      totalStock: items.filter((row: JsonMap) => row.active).reduce((sum: number, row: JsonMap) => sum + Number(row.stock || 0), 0),
      lowStock: items.filter((row: JsonMap) => row.active && Number(row.stock || 0) <= Number(row.min_stock || 0)).length,
      ...(activity.rows[0] || {}),
    } } };
  }

  async listMovements(user: AuthUser, query: JsonMap) {
    requireAllowed(user);
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize || 20)));
    const values: unknown[] = [];
    const clauses = ['1=1'];
    const add = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (user.role === 'pg_staff') clauses.push(`lower(coalesce(m.pg_code,m.created_by_code))=lower(${add(user.employeeCode)})`);
    if (query.dateFrom) clauses.push(`m.occurred_at >= ${add(String(query.dateFrom))}::date`);
    if (query.dateTo) clauses.push(`m.occurred_at < (${add(String(query.dateTo))}::date + interval '1 day')`);
    if (query.recipient) {
      const recipient = String(query.recipient).trim();
      const digits = recipient.replace(/\D/g, '');
      const nameSearch = `m.recipient_name ilike ${add(`%${recipient}%`)}`;
      clauses.push(digits ? `(${nameSearch} or regexp_replace(coalesce(m.recipient_phone,''),'\\D','','g') like ${add(`%${digits}%`)})` : nameSearch);
    }
    if (query.quantityMin) clauses.push(`m.quantity >= ${add(Number(query.quantityMin))}`);
    if (query.quantityMax) clauses.push(`m.quantity <= ${add(Number(query.quantityMax))}`);
    if (query.itemId) clauses.push(`m.gift_item_id=${add(String(query.itemId))}::uuid`);
    if (query.movementType) clauses.push(`m.movement_type=${add(String(query.movementType))}`);
    if (query.pgCode && user.role !== 'pg_staff') clauses.push(`lower(m.pg_code)=lower(${add(String(query.pgCode))})`);
    const where = clauses.join(' and ');
    const total = await this.infrastructure.postgres.query<{ total: number }>(`select count(*)::int total from marketing.gift_stock_movements m where ${where}`, values);
    values.push(pageSize, (page - 1) * pageSize);
    const rows = await this.infrastructure.postgres.query(
      `select m.*,i.code item_code,i.name item_name,i.unit,
              coalesce(nullif(p.payload->>'full_name',''),nullif(e.payload->>'full_name',''),m.pg_code) pg_name
       from marketing.gift_stock_movements m join marketing.gift_items i on i.id=m.gift_item_id
       left join app.records p on p.entity_type='profiles' and p.deleted_at is null and lower(p.payload->>'employee_code')=lower(m.pg_code)
       left join app.records e on e.entity_type='employees' and e.deleted_at is null and lower(e.payload->>'code')=lower(m.pg_code)
       where ${where} order by m.occurred_at desc,m.created_at desc limit $${values.length - 1} offset $${values.length}`,
      values,
    );
    return { data: rows.rows, meta: { total: total.rows[0]?.total || 0, page, pageSize, pageCount: Math.max(1, Math.ceil((total.rows[0]?.total || 0) / pageSize)) } };
  }

  async createItem(user: AuthUser, input: JsonMap) {
    requireManager(user);
    const code = String(input.code || '').trim().toUpperCase();
    const name = String(input.name || '').trim();
    if (!code || !name) throw new BadRequestException('Mã và tên quà tặng là bắt buộc.');
    const categoryId = String(input.categoryId || '').trim();
    if (!categoryId) throw new BadRequestException('Vui lòng chọn danh mục quà tặng.');
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.gift_items(code,name,category_id,category,unit,min_stock,note,created_by_code)
       select $1,$2,c.id,c.name,$4,$5,$6,$7 from marketing.gift_categories c where c.id=$3::uuid and c.active=true returning *`,
      [code,name,categoryId,String(input.unit || 'phần').trim(),Math.max(0,Number(input.minStock || 0)),String(input.note || '').trim() || null,user.employeeCode],
    );
    if (!result.rows[0]) throw new BadRequestException('Danh mục quà tặng không tồn tại hoặc đã ngừng sử dụng.');
    await this.infrastructure.markDataChanged(['marketing.gifts'], user.id, user.role);
    return { data: result.rows[0] };
  }

  async createCategory(user: AuthUser, input: JsonMap) {
    requireManager(user);
    const code = String(input.code || '').trim().toUpperCase();
    const name = String(input.name || '').trim();
    if (!code || !name) throw new BadRequestException('Mã và tên danh mục là bắt buộc.');
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.gift_categories(code,name,description,color,created_by_code)
       values($1,$2,$3,$4,$5) returning *`,
      [code,name,String(input.description || '').trim() || null,String(input.color || '#0f8b7c'),user.employeeCode],
    );
    await this.infrastructure.markDataChanged(['marketing.gifts'], user.id, user.role);
    return { data: result.rows[0] };
  }

  async updateItem(user: AuthUser, id: string, input: JsonMap) {
    requireManager(user);
    const result = await this.infrastructure.postgres.query(
      `update marketing.gift_items set name=coalesce(nullif($2,''),name),category=coalesce(nullif($3,''),category),
       unit=coalesce(nullif($4,''),unit),min_stock=coalesce($5,min_stock),active=coalesce($6,active),note=$7,updated_at=now()
       where id=$1::uuid returning *`,
      [id,String(input.name || '').trim(),String(input.category || '').trim(),String(input.unit || '').trim(),input.minStock === undefined ? null : Math.max(0,Number(input.minStock)),input.active === undefined ? null : Boolean(input.active),input.note === undefined ? null : String(input.note || '').trim() || null],
    );
    if (!result.rows[0]) throw new BadRequestException('Không tìm thấy quà tặng.');
    await this.infrastructure.markDataChanged(['marketing.gifts'], user.id, user.role);
    return { data: result.rows[0] };
  }

  async createMovement(user: AuthUser, input: JsonMap) {
    requireAllowed(user);
    const type = String(input.movementType || 'issue');
    const managerOnly = new Set(['stock_in','return','adjustment_in','adjustment_out']);
    if (managerOnly.has(type)) requireManager(user);
    if (!['stock_in','issue','return','adjustment_in','adjustment_out'].includes(type)) throw new BadRequestException('Loại giao dịch không hợp lệ.');
    const quantity = positiveInt(input.quantity, 'Số lượng');
    const itemId = String(input.itemId || '');
    const recipientName = String(input.recipientName || '').trim();
    if (type === 'issue' && !recipientName) throw new BadRequestException('Vui lòng nhập người nhận quà.');
    const customerImageUrl = String(input.customerImageUrl || '').trim();
    const receiptUrl = String(input.receiptUrl || '').trim();
    if (type === 'issue' && (!customerImageUrl || !receiptUrl)) {
      throw new BadRequestException('Giao dịch trao quà cần đủ ảnh khách nhận quà và ảnh bill/biên lai.');
    }
    if ((customerImageUrl && !customerImageUrl.startsWith('/api/v2/files/')) || (receiptUrl && !receiptUrl.startsWith('/api/v2/files/'))) {
      throw new BadRequestException('Đường dẫn ảnh xác nhận không hợp lệ.');
    }
    const pgCode = user.role === 'pg_staff' ? user.employeeCode : String(input.pgCode || user.employeeCode).trim();
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      const item = await client.query('select id from marketing.gift_items where id=$1::uuid and active=true for update', [itemId]);
      if (!item.rows[0]) throw new BadRequestException('Quà tặng không tồn tại hoặc đã ngừng sử dụng.');
      const stock = await client.query<{ stock: number }>(
        `select coalesce(sum(case when affects_stock then case when movement_type in ('stock_in','return','adjustment_in') then quantity else -quantity end else 0 end),0)::int stock
         from marketing.gift_stock_movements where gift_item_id=$1::uuid`, [itemId],
      );
      if (['issue','adjustment_out'].includes(type) && stock.rows[0].stock < quantity) throw new BadRequestException(`Không đủ tồn kho. Hiện còn ${stock.rows[0].stock}.`);
      const result = await client.query(
        `insert into marketing.gift_stock_movements(gift_item_id,movement_type,quantity,recipient_name,recipient_phone,lead_id,pg_code,branch_id,note,occurred_at,created_by_code,created_by_role,customer_image_url,customer_image_name,receipt_url,receipt_name)
         values($1::uuid,$2,$3,$4,$5,nullif($6,'')::uuid,$7,$8,$9,coalesce(nullif($10,'')::timestamptz,now()),$11,$12,nullif($13,''),nullif($14,''),nullif($15,''),nullif($16,'')) returning *`,
        [itemId,type,quantity,recipientName || null,String(input.recipientPhone || '').trim() || null,String(input.leadId || ''),pgCode,String(input.branchId || user.branchId || '').trim() || null,String(input.note || '').trim() || null,String(input.occurredAt || ''),user.employeeCode,user.role,customerImageUrl,String(input.customerImageName || '').slice(0,250),receiptUrl,String(input.receiptName || '').slice(0,250)],
      );
      await client.query('commit');
      await this.infrastructure.markDataChanged(['marketing.gifts'], user.id, user.role);
      return { data: result.rows[0] };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }
}

@Controller('/api/v2/marketing/gifts')
@UseGuards(AuthGuard)
export class GiftsController {
  constructor(private readonly service: GiftsService) {}
  @Get('/overview') overview(@Req() req: ActorRequest) { return this.service.overview(req.user); }
  @Get('/movements') movements(@Req() req: ActorRequest, @Query() query: JsonMap) { return this.service.listMovements(req.user, query); }
  @Post('/items') item(@Req() req: ActorRequest, @Body() body: JsonMap) { return this.service.createItem(req.user, body); }
  @Post('/categories') category(@Req() req: ActorRequest, @Body() body: JsonMap) { return this.service.createCategory(req.user, body); }
  @Patch('/items/:id') updateItem(@Req() req: ActorRequest, @Param('id') id: string, @Body() body: JsonMap) { return this.service.updateItem(req.user, id, body); }
  @Post('/movements') movement(@Req() req: ActorRequest, @Body() body: JsonMap) { return this.service.createMovement(req.user, body); }
}
