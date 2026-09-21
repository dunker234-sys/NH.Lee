import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { LeaveTypeService } from './leave-type.service';

@ApiTags('leave')
@Roles('ADMIN', 'HQ_HR')
@Controller('admin/leave/types')
export class LeaveTypeAdminController {
  constructor(private readonly service: LeaveTypeService) {}

  @Post()
  create(@Body() dto: CreateLeaveTypeDto) {
    return this.service.create(dto);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.service.update(id, dto);
  }
}
