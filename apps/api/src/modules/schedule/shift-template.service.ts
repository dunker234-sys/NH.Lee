import { Injectable } from '@nestjs/common';
import { ShiftTemplate } from '@prisma/client';
import { OrgScope } from '../../common/scope/org-scope.types';
import { CreateShiftTemplateDto } from './dto/create-shift-template.dto';
import { UpdateShiftTemplateDto } from './dto/update-shift-template.dto';
import { ShiftTemplateRepository, shiftTemplateTimesAsStrings } from './shift-template.repository';

@Injectable()
export class ShiftTemplateService {
  constructor(private readonly repo: ShiftTemplateRepository) {}

  create(scope: OrgScope, dto: CreateShiftTemplateDto): Promise<ShiftTemplate> {
    return this.repo.create(scope, dto);
  }

  async list(scope: OrgScope, siteId: string) {
    const rows = await this.repo.list(scope, siteId);
    return rows.map((r) => ({ ...r, ...shiftTemplateTimesAsStrings(r) }));
  }

  update(scope: OrgScope, id: string, dto: UpdateShiftTemplateDto): Promise<ShiftTemplate> {
    return this.repo.update(scope, id, dto);
  }

  remove(scope: OrgScope, id: string): Promise<void> {
    return this.repo.remove(scope, id);
  }
}
