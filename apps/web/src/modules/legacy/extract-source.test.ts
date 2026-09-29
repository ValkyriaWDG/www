import { describe, expect, it } from 'vitest';
import { announcementTree, extractLegacyFaq, parseLegacyFrontmatter } from './extract-source';

describe('bounded legacy source metadata', () => {
  it('reads quoted/plain scalars and credits without executing MDX', () => {
    const parsed = parseLegacyFrontmatter('---\ntitle: "Example: guide"\npublishDate: 2024-06-08\nauthors:\n  - Author\n---\n<ArbitraryCode />');
    expect(parsed.metadata).toEqual({ title: 'Example: guide', publishDate: '2024-06-08', authors: ['Author'] });
    expect(parsed.body).toBe('<ArbitraryCode />');
  });
  it('rejects unhandled YAML structures and duplicate keys', () => {
    expect(() => parseLegacyFrontmatter('---\ntitle: !!js/function code\n---\nx')).toThrow();
    expect(() => parseLegacyFrontmatter('---\ntitle: x\ntitle: y\n---\nx')).toThrow();
  });
  it('extracts literal FAQ data and rejects executable values', () => {
    expect(extractLegacyFaq('const faqs = [{ question: "Question?", answer: "Answer." }]; export default () => null;')).toEqual([{ question: 'Question?', answer: 'Answer.' }]);
    expect(() => extractLegacyFaq('const faqs = [{ question: "Question?", answer: fetch("https://secret") }];')).toThrow('expressions');
    expect(() => extractLegacyFaq('const faqs = loadPrivateData();')).toThrow('literal');
  });
  it('retains archived announcement formatting without compiling JSX', () => {
    expect(announcementTree('**Expired**\n<hr/>\nSee [source](https://example.com).').children?.map((node) => node.tag)).toEqual(['p', 'hr', 'p']);
    expect(() => announcementTree('<Unsafe expression={run()} />')).toThrow();
  });
});
