/**
 * 키오스크 응답의 "개인정보 노출 최소화" 요구를 만족하는 순수 함수 —
 * 전체 이름은 절대 응답에 담기지 않고, 이 함수가 계산한 마스킹 결과만
 * 나간다. 한국어 이름 표기 관례: 2자 이름은 마지막 글자만, 3자 이상은
 * 첫/끝 글자만 남기고 가운데를 전부 마스킹한다.
 */
export function maskName(name: string): string {
  const chars = [...name.trim()];
  if (chars.length === 0) return '';
  if (chars.length === 1) return chars[0];
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}
