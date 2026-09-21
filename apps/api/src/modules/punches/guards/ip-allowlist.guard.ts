import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { isIpInCidr } from '../../../common/net/cidr.util';

export class IpNotAllowedError extends ForbiddenException {
  constructor(clientIp: string) {
    super({
      code: 'IP_NOT_ALLOWED',
      message: '허용되지 않은 네트워크에서의 접속입니다. 사업장 관리자에게 IP 등록을 요청하세요.',
      clientIp,
    });
  }
}

/**
 * `::ffff:1.2.3.4` 같은 IPv4-매핑 IPv6 표현을 순수 IPv4로 벗겨내고,
 * IPv6 루프백(`::1`)은 IPv4 루프백(`127.0.0.1`)으로 취급한다.
 *
 * 실측으로 확인한 사실(admin-web을 실제 브라우저로 붙여 테스트하며 발견):
 * 같은 개발 머신에서도 "localhost"가 어떤 요청은 `::ffff:127.0.0.1`로,
 * 어떤 요청은 순수 `::1`로 접속한다 — Node/OS의 DNS 해석 순서(Happy
 * Eyeballs)에 달려 있어 클라이언트가 통제할 수 없다. `::1`↔`127.0.0.1`
 * 매핑을 두지 않으면 같은 로컬 개발자가 매번 다른 결과를 겪는다. 이
 * 매핑이 보안을 약화시키지 않는 이유: 루프백 주소는 애초에 같은
 * 물리/가상 호스트에서만 도달 가능하다 — 원격 공격자가 네트워크로
 * "루프백인 척" 스푸핑할 방법이 없다(실제 운영 환경의 CIDR은 사무실 IP
 * 대역이지 루프백이 아니다). 프로덕션 IPv6 클라이언트 일반을 지원하는
 * 문제와는 다른 차원 — 그건 §6.2의 "IPv4만 지원" 결정과 별개로 남아있는
 * 갭이다(문서화됨).
 */
function normalizeIp(ip: string): string {
  if (ip === '::1') return '127.0.0.1';
  const prefix = '::ffff:';
  return ip.startsWith(prefix) ? ip.slice(prefix.length) : ip;
}

/**
 * registrationMethod==='PC'인 타각만 IP 허용목록으로 제한한다 — GPS/NFC/QR/
 * TABLET은 그대로 통과(TABLET은 KioskDeviceGuard가 별도로 지킨다). Nest/
 * Express는 가드 실행 전에 이미 바디를 파싱해 두므로 request.body를 읽을
 * 수 있다(ValidationPipe가 아직 돌기 전이라 원시 파싱값이지만, 이 가드가
 * 필요한 필드명은 와이어 포맷과 동일하다).
 *
 * main.ts가 app.set('trust proxy', ...)를 호출하지 않으므로 request.ip는
 * 지금은 TCP 소켓 주소 그대로다(리버스 프록시가 없는 현재 배포 환경에서는
 * 정확) — 나중에 리버스 프록시를 앞에 두면 이 값이 프록시 주소가 되므로
 * 그때 trust proxy를 신중히 설정해야 한다. 프록시가 없는데 미리 켜면
 * X-Forwarded-For 스푸핑에 노출되므로 여기서 임의로 켜지 않는다.
 */
@Injectable()
export class IpAllowlistGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body ?? {};
    // 단일 타각(POST /punches)과 벌크(POST /punches/bulk) 둘 다 지원한다 —
    // 벌크 중 하나라도 PC면 그 siteId의 허용목록을 통과해야 요청 전체가
    // 진행된다(부분 우회를 허용하지 않는다).
    const candidates: { registrationMethod?: string; siteId?: string }[] = Array.isArray(body.items)
      ? body.items
      : [body];
    const pcCandidates = candidates.filter((c) => c.registrationMethod === 'PC');
    if (pcCandidates.length === 0) return true;

    const clientIp = normalizeIp(request.ip ?? '');
    const siteIds = [...new Set(pcCandidates.map((c) => c.siteId).filter((id): id is string => Boolean(id)))];
    if (siteIds.length === 0) throw new IpNotAllowedError(clientIp);

    for (const siteId of siteIds) {
      const allowlist = await this.prisma.siteIpAllowlist.findMany({ where: { siteId, active: true } });
      // 항목이 하나도 없으면 fail-closed — 사업장이 최소 1개는 명시적으로
      // 등록해야 PC 타각이 열린다(조용히 전체 허용하는 쪽보다 안전한 기본값).
      const allowed = allowlist.some((row) => isIpInCidr(clientIp, row.cidr));
      if (!allowed) throw new IpNotAllowedError(clientIp);
    }
    return true;
  }
}
