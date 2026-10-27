#!/usr/bin/env node
// Builds tests/fixtures/engine/learning-at-work.pdf using Node built-ins only.
// The PDF is hand-written (no library): real text objects, one page per entry.
// All fixture text is authored for Unbookin and released under CC0 1.0.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, '..', '..', 'tests', 'fixtures', 'engine', 'learning-at-work.pdf');

const pages = [
  {
    heading: 'BAB 1 Learning as a Daily Practice',
    paragraphs: [
      'Learning at work is often treated as a separate activity: a course, a workshop, or a short period of study before returning to real work. That model is convenient, but it separates learning from the conditions in which skills are actually used. Most durable learning happens inside ordinary work, through small experiments, feedback, and reflection on what happened.',
      'A useful starting point is to notice the difference between activity and practice. Activity fills the day with tasks. Practice deliberately improves the ability to perform a task. The difference is attention. A person who answers support tickets for a year may become faster, but a person who reviews a sample of those tickets each week and compares them with a quality standard will improve in a more directed way.',
      'Deliberate practice requires a target that is specific enough to observe. A vague goal such as becoming better at communication is difficult to practice. A specific goal such as explaining a technical decision in five sentences without jargon can be practiced, observed, and improved. Specific goals turn learning from a mood into a sequence of small tests.',
      'Feedback is the second condition. Without feedback, practice can reinforce mistakes. Feedback does not need to come from a manager or a formal review. It can come from a customer response, a failed test, a comparison with an example of good work, or a short conversation with a colleague. The important quality is honesty. Feedback that avoids the difficult part teaches very little.',
      'Reflection is the third condition. A short review after a meaningful task can turn experience into knowledge. The review asks what was expected, what happened, and what will change next time. It does not need to be written in a formal report. A few lines in a notebook are enough. The value comes from making the comparison explicit rather than leaving it to memory.',
      'These three conditions are simple, but they are fragile in a busy environment. When deadlines press, practice becomes activity, feedback becomes polite silence, and reflection disappears. A team that wants to learn must protect these conditions deliberately. That protection is a management decision, not a personal virtue.',
    ],
  },
  {
    heading: 'BAB 2 Designing Work That Teaches',
    paragraphs: [
      'Some work teaches more than other work. A task that is repetitive and fully specified offers little room for growth after the first few repetitions. A task that contains a real problem, a clear standard, and access to feedback offers much more. The design of work therefore shapes the learning that is possible. A manager who wants a capable team must pay attention to how tasks are assigned, not only to who is assigned.',
      'One useful design principle is to make the standard visible. People learn faster when they can compare their output with a concrete example of good work. The example should come with an explanation of why it is good. Without the explanation, people may copy the surface details and miss the reasoning. With it, they can transfer the principle to a different situation.',
      'Another principle is to vary the difficulty on purpose. Work that is always easy becomes boring, while work that is always overwhelming becomes discouraging. A sequence that moves from supported practice to independent practice keeps attention engaged. The support can be a checklist, a pair session, or a review before delivery. The goal is to remove support gradually as competence grows.',
      'Handovers are an underrated learning opportunity. When a task moves from one person to another, the explanation reveals assumptions that were previously invisible. A good handover asks the receiver to restate the goal, the constraints, and the next action. If the receiver cannot restate them, the handover is incomplete. This practice reduces errors and builds shared understanding.',
      'Meetings can also teach or waste time depending on their design. A meeting with no decision, no owner, and no record of what changed produces little learning. A short meeting that reviews evidence, makes a decision, and records the reasoning produces a reusable lesson. The difference is not the length. It is whether the meeting creates knowledge that survives the room.',
      'Finally, work should leave room for a post mortem that is not a search for blame. A post mortem is useful when it explains the conditions that made an error likely and identifies a change that reduces the chance of repetition. When it becomes a trial, people protect themselves instead of explaining what happened. The learning stops, and the same error returns in a new form.',
    ],
  },
  {
    heading: 'BAB 3 Turning Experience into Shared Knowledge',
    paragraphs: [
      'Individual learning becomes valuable to an organisation only when it can be shared. Sharing is not the same as telling. A person who explains a lesson in a meeting may feel heard, but the lesson may not survive the meeting. Durable sharing requires a form that other people can find and use later: a short note, a checklist, a documented example, or a recorded decision with its reasoning.',
      'Documentation has a reputation for being heavy and outdated. That reputation comes from documents that try to capture everything. A more useful approach is to capture the smallest piece of knowledge that changes behaviour. A single paragraph explaining why a common fix causes a problem can save hours. A checklist with five items can prevent a recurring mistake. Small documents are more likely to be read and updated.',
      'A community of practice can accelerate sharing, but only if it has a purpose beyond meetings. The purpose might be to improve a specific process, to review difficult cases, or to maintain a shared standard. Without a purpose, the community becomes a social calendar. With a purpose, it creates artefacts that other people can use. The artefacts are the evidence that the community is working.',
      'Mentoring is another form of shared knowledge, but it depends on a relationship rather than a document. A mentor can explain not only what to do but why it matters in a particular context. This kind of explanation is difficult to capture in a manual. It requires time and trust. A mentoring relationship works best when both people have a clear goal and a regular opportunity to review progress.',
      'Knowledge also disappears when people leave. A team that depends on one person for a critical process is exposed, even if that person is generous. Reducing the dependency is not a sign of distrust. It is a form of respect for the person and for the team. The work is to make the critical knowledge explicit while the person is still available to explain it.',
      'None of these practices requires a large programme. A team can begin with one small habit: after a difficult task, write five lines about what changed and where the note can be found. Over time, the notes form a record of experience that new people can read and experienced people can challenge. This record is not a substitute for practice, but it makes practice easier to repeat.',
    ],
  },
  {
    paragraphs: [
      'A learning culture is often described in terms of attitudes: curiosity, openness, humility. Those attitudes matter, but they are not enough on their own. Culture is also a set of routines that make certain behaviours easier than others. If a team has no time for reflection, no access to feedback, and no place to store what it learned, curiosity has nowhere to go.',
      'The routines do not need to be elaborate. A weekly review of one difficult case can be enough to surface a recurring problem. A shared folder with short notes can be enough to preserve a lesson. A checklist can be enough to prevent a common error. The value comes from repetition and from the willingness to improve the routine when it stops working.',
      'It is also important to measure learning in a way that reflects reality. The number of training hours completed is a weak measure because it records attendance rather than capability. A better measure is the number of tasks completed with less support, the time taken to resolve a recurring problem, or the reduction in repeated errors. These measures are closer to the work and harder to fake.',
      'Leaders influence these routines by what they reward. If people are rewarded only for speed, reflection will be treated as overhead. If people are rewarded for improving a process without acknowledging the cost of the improvement, the team may optimize one part and damage another. A balanced view of performance makes it possible to learn without hiding the trade-offs.',
      'The final point is patience. Learning routines often look inefficient in the short term because their benefits appear later. A team that abandons a routine after two weeks because it did not produce an immediate result will keep returning to the same problems. The routine needs enough time to become normal and enough honesty to be adjusted. That combination is what turns a collection of individuals into a team that can improve.',
      'Learning at work is therefore not a separate project. It is a way of designing tasks, giving feedback, reflecting on results, and preserving what was learned. When those habits are present, experience becomes more than the passage of time. It becomes a resource that the whole team can use.',
    ],
  },
];

function escapePdfText(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function wrap(text, maxChars = 88) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length === 0) current = word;
    else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

const objects = [];
function addObject(body) {
  objects.push(body);
  return objects.length;
}

const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
const pagesId = addObject('');
const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

const pageIds = [];
for (const page of pages) {
  const lines = [];
  if (page.heading) lines.push(page.heading);
  for (const paragraph of page.paragraphs) {
    lines.push(...wrap(paragraph));
    lines.push('');
  }
  const content = ['BT', '/F1 10 Tf', '14 TL', '45 800 Td'];
  lines.forEach((line, index) => {
    if (index > 0) content.push('T*');
    content.push(`(${escapePdfText(line)}) Tj`);
  });
  content.push('ET');
  const stream = content.join('\n');
  const contentId = addObject(
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
  );
  const pageId = addObject(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
  );
  pageIds.push(pageId);
}

objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

const chunks = [];
let offset = 0;
const header = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
chunks.push(Buffer.from(header, 'latin1'));
offset += Buffer.byteLength(header, 'latin1');
const xref = [];
for (let index = 0; index < objects.length; index += 1) {
  const body = `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  xref.push(offset);
  const buffer = Buffer.from(body, 'latin1');
  chunks.push(buffer);
  offset += buffer.length;
}
const xrefStart = offset;
const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
for (const position of xref) {
  xrefLines.push(`${String(position).padStart(10, '0')} 00000 n `);
}
xrefLines.push('trailer', `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`, 'startxref', String(xrefStart), '%%EOF', '');
chunks.push(Buffer.from(xrefLines.join('\n'), 'latin1'));

writeFileSync(output, Buffer.concat(chunks));
console.log(`Wrote ${output}`);
