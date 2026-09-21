import { parseCsv } from './csv-parse.util';

describe('parseCsv', () => {
  it('기본 콤마 구분 필드를 파싱한다', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('따옴표로 감싼 필드 안의 콤마를 보존한다', () => {
    expect(parseCsv('name,note\n홍길동,"서울, 강남구"\n')).toEqual([
      ['name', 'note'],
      ['홍길동', '서울, 강남구'],
    ]);
  });

  it('이스케이프된 따옴표("")를 처리한다', () => {
    expect(parseCsv('a\n"he said ""hi"""\n')).toEqual([['a'], ['he said "hi"']]);
  });

  it('마지막 줄바꿈이 없어도 마지막 행을 잃지 않는다', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
