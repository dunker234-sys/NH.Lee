import { Injectable, NotFoundException } from '@nestjs/common';
import { Site } from '@prisma/client';
import { EmployeeSiteAssignmentWithSite, SitesRepository } from './sites.repository';

export interface SiteSummary {
  id: string;
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  geofenceRadiusM: number;
  assignmentRole?: 'PRIMARY' | 'SECONDARY';
}

function toSummary(site: Site, assignmentRole?: 'PRIMARY' | 'SECONDARY'): SiteSummary {
  return {
    id: site.id,
    code: site.code,
    name: site.name,
    lat: site.lat === null ? null : Number(site.lat),
    lng: site.lng === null ? null : Number(site.lng),
    geofenceRadiusM: site.geofenceRadiusM,
    assignmentRole,
  };
}

@Injectable()
export class SitesService {
  constructor(private readonly repo: SitesRepository) {}

  /**
   * 호출자의 활성 배정만 반환한다 — 관리자용 헤드카운트 캐시, QR 시크릿 등
   * 내부 필드는 절대 포함하지 않는다(punches.controller.ts가 응답을 좁은
   * 투영으로만 반환하는 것과 같은 원칙).
   */
  async listActiveForEmployee(employeeId: string, asOfDate = new Date()): Promise<SiteSummary[]> {
    const assignments: EmployeeSiteAssignmentWithSite[] = await this.repo.findActiveAssignmentsForEmployee(employeeId, asOfDate);
    return assignments.map((a) => toSummary(a.site, a.assignmentRole));
  }

  /**
   * 임의 사업장 상세 — 파견/외근 등으로 본인 배정에 없는 siteId를 이름으로
   * 해석해야 하는 경우가 있어(예: dispatch_request), 활성 배정으로 제한하지
   * 않는다. 노출 필드는 listActiveForEmployee와 동일하게 좁게 유지한다.
   */
  async getById(siteId: string): Promise<SiteSummary> {
    const site = await this.repo.findById(siteId);
    if (!site) throw new NotFoundException({ code: 'SITE_NOT_FOUND' });
    return toSummary(site);
  }
}
