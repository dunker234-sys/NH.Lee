// mock↔real 배선이 결정되는 유일한 지점(계획서 §2.3). 화면은 여기서
// export하는 이름만 import한다 — 어느 도메인이 목업인지 실제 API인지는
// 화면 코드가 알 필요 없다. STEP6-9가 각 도메인의 실제 백엔드를 만들면
// `scheduleApi.real.ts`처럼 interface(types.ts)를 구현하는 파일을 추가하고
// 아래 한 줄만 바꾸면 된다.

export { authApi } from './authApi';
export { punchApi } from './punchApi';
export { notificationApi } from './notificationApi';
export { consentApi } from './consentApi';
export { locationAccessLogApi } from './locationAccessLogApi';
export { sitesApi } from './sitesApi';

import { mockApplicationsApi } from './applicationsApi.mock';
import { mockAttendanceApi } from './attendanceApi.mock';
import { mockComplianceApi } from './complianceApi.mock';
import { mockLeaveApi } from './leaveApi.mock';
import { mockScheduleApi } from './scheduleApi.mock';
import { ApplicationsApi, AttendanceApi, ComplianceApi, LeaveApi, ScheduleApi } from './types';

export const attendanceApi: AttendanceApi = mockAttendanceApi; // STEP3 결과 읽기 API + STEP8 정정이 생기면 교체
export const scheduleApi: ScheduleApi = mockScheduleApi; // STEP6가 실제 백엔드를 만들면 교체
export const leaveApi: LeaveApi = mockLeaveApi; // STEP7
export const applicationsApi: ApplicationsApi = mockApplicationsApi; // STEP6.5/7/8
export const complianceApi: ComplianceApi = mockComplianceApi; // STEP9 — 홈 화면의 52시간 게이지도 이걸 쓴다
