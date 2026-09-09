import { BadRequestException, Controller, Get, Injectable, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

type JsonMap = Record<string, any>;
const WORKFLOW = 'monthly_schedule_v1';

function validMonth(value: string) {
  return /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
}

function workflow(request?: JsonMap) {
  if (!request) return { workflow: WORKFLOW, stage: 'approved', legacy: true };
  try {
    const meta = JSON.parse(String(request.preference || '{}')) as JsonMap;
    if (meta.workflow !== WORKFLOW) return { workflow: WORKFLOW, stage: 'approved', legacy: true };
    const fallback = request.status === 'approved' ? 'approved' : request.status === 'rejected' ? 'returned' : 'draft';
    return { workflow: WORKFLOW, stage: meta.stage || fallback, ...meta, legacy: false };
  } catch {
    return { workflow: WORKFLOW, stage: 'approved', legacy: true };
  }
}

@Injectable()
export class ScheduleService {
  constructor(private readonly infrastructure: InfrastructureService) {}

  private async records(entityType: string) {
    const result = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records
       where entity_type=$1 and deleted_at is null
       order by coalesce(payload->>'updated_at', payload->>'submitted_at', '') desc`,
      [entityType],
    );
    return result.rows.map((row) => row.payload);
  }

  async doctorRoster(user: AuthUser, month: string, branch = 'all') {
    if (!validMonth(month)) throw new BadRequestException('Tháng không hợp lệ.');
    // The doctor roster is a coordination screen for staff, not a cross-branch
    // directory.  Never trust a branch supplied by the browser here: a normal
    // employee may only receive the doctors of the branch on their own account.
    const viewerBranch = String(user.branchId || user.profile?.branch_id || '').trim();
    if (!viewerBranch) throw new BadRequestException('Tài khoản chưa được gán chi nhánh để xem lịch bác sĩ.');
    const end = monthEnd(month);
    const [allEmployees, allAssignments, allRequests, shifts, allAllowed] = await Promise.all([
      this.records('employees'),
      this.records('schedule_assignments'),
      this.records('schedule_requests'),
      this.records('work_shifts'),
      this.records('employee_allowed_shifts'),
    ]);
    let doctors = allEmployees.filter((employee) => employee.status === 'active'
      && (employee.department === 'bs' || employee.role === 'bac_si' || String(employee.department || '').toLowerCase() === 'chuyên môn')
      && employee.branch_id === viewerBranch);
    const doctorCodes = new Set(doctors.map((employee) => String(employee.code)));
    const assignments = allAssignments.filter((item) => doctorCodes.has(String(item.employee_code))
      && String(item.work_date) >= `${month}-01` && String(item.work_date) <= end);
    const latestRequest = new Map<string, JsonMap>();
    allRequests.filter((item) => doctorCodes.has(String(item.employee_code)) && item.work_month === month)
      .sort((left, right) => String(right.submitted_at || '').localeCompare(String(left.submitted_at || '')))
      .forEach((item) => {
        const code = String(item.employee_code);
        if (!latestRequest.has(code)) latestRequest.set(code, item);
      });
    const assignedCodes = new Set(assignments.map((item) => String(item.employee_code)));
    const publishedCodes = new Set(doctors.filter((doctor) => {
      if (!assignedCodes.has(String(doctor.code))) return false;
      return workflow(latestRequest.get(String(doctor.code))).stage === 'approved';
    }).map((doctor) => String(doctor.code)));
    doctors = doctors.filter((doctor) => publishedCodes.has(String(doctor.code)));
    const requests = doctors.map((doctor) => {
      const request = latestRequest.get(String(doctor.code));
      return {
        employee_code: doctor.code,
        id: request?.id || null,
        status: 'approved',
        submitted_at: request?.submitted_at || null,
        ...workflow(request),
      };
    });
    return {
      month,
      profile: { ...user.profile, branch_id: viewerBranch },
      branch: viewerBranch,
      view_mode: 'doctor_roster',
      published_only: true,
      employees: doctors,
      shifts: shifts.filter((shift) => shift.active !== false),
      allowed: allAllowed.filter((item) => publishedCodes.has(String(item.employee_code))),
      assignments: assignments.filter((item) => publishedCodes.has(String(item.employee_code))),
      requests,
    };
  }
}

@Controller('/api/v2/schedule')
@UseGuards(AuthGuard)
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get('/doctor-roster')
  doctorRoster(
    @Req() request: { user: AuthUser },
    @Query('month') month: string,
    @Query('branch') branch = 'all',
  ) {
    return this.schedule.doctorRoster(request.user, String(month || ''), String(branch || 'all'));
  }
}
