import { maskName } from './name-mask.util';

describe('maskName', () => {
  it('3자 이상 이름은 첫/끝 글자만 남기고 가운데를 마스킹한다', () => {
    expect(maskName('홍길동')).toBe('홍*동');
    expect(maskName('김민준수')).toBe('김**수');
  });

  it('2자 이름은 마지막 글자만 마스킹한다', () => {
    expect(maskName('이수')).toBe('이*');
  });

  it('1자 이름은 마스킹하지 않는다(더 가릴 글자가 없다)', () => {
    expect(maskName('강')).toBe('강');
  });

  it('빈 문자열은 빈 문자열을 반환한다', () => {
    expect(maskName('')).toBe('');
    expect(maskName('   ')).toBe('');
  });

  it('전체 이름 원문은 반환값 어디에도 포함되지 않는다', () => {
    const masked = maskName('박서준');
    expect(masked).not.toContain('서');
  });
});
