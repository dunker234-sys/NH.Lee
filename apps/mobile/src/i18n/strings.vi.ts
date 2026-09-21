import { StringKey } from './strings.ko';

// 누락된 키는 ko로 자동 폴백된다 — 핵심 화면(홈/타각/동의)만 우선 번역했다.
const vi: Partial<Record<StringKey, string>> = {
  common_confirm: 'Xác nhận',
  common_cancel: 'Hủy',
  common_retry: 'Thử lại',
  common_loading: 'Đang tải...',
  common_error_generic: 'Đã xảy ra lỗi. Vui lòng thử lại.',

  login_title: 'Chấm công',
  login_employee_no: 'Mã nhân viên',
  login_password: 'Mật khẩu',
  login_submit: 'Đăng nhập',
  login_error: 'Mã nhân viên hoặc mật khẩu không đúng.',
  login_biometric_prompt: 'Đăng nhập chấm công',

  home_greeting: 'Xin chào, {name}',
  home_today_schedule: 'Lịch làm việc hôm nay',
  home_worked_so_far: 'Đã làm việc',
  home_weekly_gauge_title: 'Tuần này',
  home_punch_in: 'Vào ca',
  home_punch_out: 'Tan ca',
  home_punch_completed: 'Đã ghi nhận {type}',
  home_sync_pending_banner: 'Còn {count} lượt chấm công chưa gửi — sẽ tự động gửi lại',
  home_sync_synced: 'Đã đồng bộ',
  home_open_scan: 'Chấm công bằng NFC/QR',

  punch_screen_title: 'Chấm công',
  punch_location_checking: 'Đang kiểm tra vị trí...',
  punch_location_unavailable: 'Không thể xác định vị trí — vui lòng dùng NFC/QR.',
  punch_offline_saved: 'Đã lưu ngoại tuyến · sẽ tự động gửi',
  punch_send_failed_will_retry: 'Gửi thất bại — sẽ tự động thử lại',
  punch_consent_denied_banner: 'Chưa đồng ý thu thập vị trí nên không thể chấm công GPS — hãy dùng NFC, QR hoặc ki-ốt tại hiện trường.',

  privacy_screen_title: 'Quyền riêng tư',
  privacy_pause_button: 'Tạm dừng thu thập vị trí',
  privacy_resume_button: 'Tiếp tục thu thập',
  privacy_withdraw_button: 'Rút lại sự đồng ý',
};

export default vi;
