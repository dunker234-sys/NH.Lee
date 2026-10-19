# NCP VM 배포 (SSH + docker compose)

`main`에 머지되면 CI가 이미지를 GHCR에 올리고, `production` 환경 승인 후
`deploy-production` job이 VM에 SSH로 접속해 `deploy.sh`를 실행한다.
(`infra/terraform`은 AWS 전용이며 이 배포 경로에서는 쓰지 않는다.)

**상태: 이 파일들은 실제 서버가 없는 상태에서 작성돼 한 번도 실행되지 않았다.**
YAML 문법·셸 문법·API 타입체크까지만 확인했다. 첫 배포는 아래 체크리스트대로
단계별로 확인하며 진행할 것.

## 구성

```
인터넷 → caddy(80/443, 자동 HTTPS) → api.<도메인>   → api:3000
                                    → admin.<도메인> → admin-web:3100
                                    → kiosk.<도메인> → kiosk:80
                                    postgres / redis (외부 미노출)
```

배포 순서: pull → postgres 기동 → `db-roles`(롤 비밀번호를 .env 실값으로 교체)
→ `migrate`(마이그레이션+시드) → api/admin-web/kiosk/caddy. migrate가 실패하면
api는 새 이미지로 교체되지 않는다.

## 1회성 준비 (사람이 해야 하는 일)

1. **NCP Server 생성**: Ubuntu 22.04, 최소 2vCPU/4GB 권장. 공인 IP 할당.
2. **ACG(방화벽)**: 인바운드 22(SSH, 가능하면 본인 IP만), 80, 443만 허용.
3. **서버에 Docker 설치**: `curl -fsSL https://get.docker.com | sh`, 배포용 계정을
   `docker` 그룹에 추가.
4. **DNS**: `api.`, `admin.`, `kiosk.` + `<도메인>` A 레코드 3개를 공인 IP로 지정.
   (Caddy가 인증서를 발급하려면 DNS가 먼저 전파돼 있어야 한다.)
5. **서버 `.env` 작성**: `/opt/attendance/.env`를 `infra/ncp/.env.example` 기준으로
   직접 만든다. 시크릿은 서버에서 생성하고 GitHub에는 올리지 않는다. `chmod 600`.
6. **배포 전용 SSH 키 생성**(예: `ssh-keygen -t ed25519 -f deploy_key`): 공개키를
   서버 배포 계정의 `~/.ssh/authorized_keys`에 등록.
7. **GitHub 설정** (Settings → Environments → `production`):
   - Secrets: `NCP_SSH_HOST`, `NCP_SSH_USER`, `NCP_SSH_KEY`(개인키 전체),
     `NCP_SSH_KNOWN_HOSTS`(`ssh-keyscan -t ed25519 <서버IP>` 출력)
   - Variables(저장소 Settings → Secrets and variables → Actions → Variables):
     `PUBLIC_DOMAIN`(예: `example.com`) — admin-web/kiosk 번들에 API 주소로 박힌다.
     이 값을 바꾸면 이미지를 다시 빌드해야 한다.

## 첫 배포 후 확인

- `docker compose -f /opt/attendance/docker-compose.prod.yml ps` — 전 서비스 Up,
  `migrate`/`db-roles`는 Exited (0)
- `https://api.<도메인>/health` → `{"status":"ok"}`
- `https://admin.<도메인>` 로그인 화면
- **보안 주의**: `migrate`가 개발용 시드를 실행해, 테스트 직원 계정들이 전원 공통의
  개발용 비밀번호로 생성된다. 이 비밀번호는 `apps/api/prisma/seed.ts`에 적혀 있고
  저장소가 공개라 누구나 볼 수 있다. 그러므로 **첫 배포 전에 ACG에서 80/443도
  본인 IP로만 열어 두고**, 관리자 계정 비밀번호를 변경한 뒤 전체 공개할 것.

## 알려진 한계 (이번 범위 밖)

- **DB 백업 없음**: postgres 볼륨 하나뿐이다. 운영 전에 `pg_dump` 크론 + 오프사이트
  보관(NCP Object Storage 등)을 반드시 추가할 것. punch_raw는 3년 보존 대상이다.
- 단일 VM이라 서버 장애 = 전체 중단. 배포 시 api 교체 중 짧은 중단이 있을 수 있다
  (무중단 rolling은 AWS Terraform 설계에만 있었다).
- 스테이징 환경 없음.
