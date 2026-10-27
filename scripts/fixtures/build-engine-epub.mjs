#!/usr/bin/env node
// Builds tests/fixtures/engine/financial-habits.epub using Node built-ins only.
// All fixture text is authored for Unbookin and released under CC0 1.0.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const output = join(here, '..', '..', 'tests', 'fixtures', 'engine', 'financial-habits.epub');

const chapters = [
  {
    id: 'ch1',
    title: 'BAB 1: Building a Clear View of Money',
    paragraphs: [
      'Financial habits are shaped less by knowledge than by repetition. Most people can explain the difference between saving and spending, yet many still struggle to keep a reserve. The gap is not a lack of information. It is a gap between knowing and doing. A useful habit begins with a clear view of what money is doing now, because a plan built on a guessed picture will fail as soon as reality disagrees with the guess.',
      'The clearest picture comes from three short lists. The first list contains fixed obligations: rent, utilities, insurance, transport, debt payments, and anything else that repeats every month. The second list contains variable spending: food, health, education, recreation, and small purchases that are easy to forget. The third list contains reliable income. When the lists are written down, the budget stops being a vague feeling and becomes a set of numbers that can be examined.',
      'A fixed obligation is not automatically a necessity. Some commitments were reasonable when they were made and have since become expensive habits. A subscription that is rarely used, a service that duplicates another, or a payment for something no longer valued can be removed. The purpose of the list is not to judge the past. It is to give the present a fair starting point.',
      'Variable spending deserves the same honesty. Many people underestimate small purchases because each one seems harmless. Over a month, however, small purchases can consume the space that was meant for savings. Tracking for two or three weeks is usually enough to reveal the pattern. The goal is not to eliminate pleasure. It is to spend on purpose rather than by accident.',
      'Income should be estimated conservatively. A plan that depends on overtime, bonuses, or an unusually good month is fragile. Using a lower reliable figure creates room for surprise. When the good month arrives, the surplus can be assigned to a goal instead of being absorbed by everyday life. This single habit makes a plan more resilient than a more optimistic forecast.',
      'Once the three lists exist, the next decision is about priority. Essential obligations come first, followed by a small reserve for emergencies, then high-interest debt, and finally longer-term goals. The order is not a moral ranking. It reflects the cost of getting it wrong. Missing rent is more damaging than delaying a holiday, and high-interest debt grows faster than most savings accounts.',
      'A useful review asks whether the numbers still describe the same life. A new job, a move, or a change in family circumstances can make an old budget misleading. The review does not need to be perfect. It needs to happen before a small mismatch becomes a large problem. Ten minutes with the three lists can reveal a subscription that should be cancelled, an obligation that has quietly grown, or a goal that deserves more room.',
    ],
  },
  {
    id: 'ch2',
    title: 'BAB 2: Creating a Reserve That Can Be Used',
    paragraphs: [
      'An emergency reserve is the part of a financial plan that protects everything else. Its purpose is not to earn a return. It is to prevent a single unexpected event from forcing a person into expensive borrowing. The usual target is three to six months of essential expenses, but the number matters less than the reasoning behind it. A person with stable income and a strong support network may need less. A freelancer or a single parent may need more.',
      'The reserve should be held somewhere safe and accessible. Money that can fall sharply in value is a poor emergency fund, because the moment it is needed may be the moment its value is lowest. Money that takes days to access may also fail its purpose. A separate savings account is usually enough. The separation matters because it makes the reserve visible and reduces the temptation to spend it on ordinary expenses.',
      'Building a reserve can feel slow, especially when income is tight. The useful approach is to start with a small automatic transfer and increase it when possible. Automation removes the need to decide every month. It also creates a default that favours saving before spending. A small amount repeated consistently is more reliable than a large amount that depends on motivation.',
      'The reserve should be reviewed when life changes. A rent increase, a new dependant, or a change in income alters the target. A reserve that was adequate last year may no longer be adequate now. Reviewing it once or twice a year is enough. The review is not a test of discipline. It is a chance to keep the plan connected to the life it is meant to support.',
      'It is useful to separate predictable irregular costs from true emergencies. A car service, an annual insurance premium, or a school fee is not a surprise. Dividing the cost by the months before it is due creates a sinking fund. The sinking fund prevents a predictable expense from feeling like a crisis and protects the emergency reserve for events that were genuinely unexpected.',
      'A reserve also changes behaviour. When people know that a small shock will not derail them, they make calmer decisions. They are less likely to accept a bad loan, sell an investment at the wrong time, or ignore a health problem because of cost. The financial benefit is important, but the psychological benefit is often the reason the habit survives.',
      'A reserve should not become an excuse to avoid a larger problem. If the same expense keeps drawing on the reserve, the reserve is treating a symptom rather than a cause. The review should ask why the expense returns and whether the plan needs a structural change. A reserve is a buffer, not a replacement for a realistic budget or a decision about income and obligations.',
    ],
  },
  {
    id: 'ch3',
    title: 'BAB 3: Making the Plan Last',
    paragraphs: [
      'A plan that exists only in the mind is easy to revise in hindsight. A written plan creates a record of assumptions that can be checked later. It also makes it easier to share decisions with a partner or family member. Financial choices are rarely made alone, and a written plan reduces the chance that two people are working from different pictures of the same household.',
      'Debt deserves specific attention because its cost is easy to underestimate. High-interest debt can grow faster than most investments can earn, which makes repayment a priority. Low-interest debt may be manageable while other goals are funded. The important step is to know the interest rate, the minimum payment, and the total cost of paying only the minimum. Without those numbers, a monthly payment can create a false sense of control.',
      'Insurance protects against events that may never happen, which is why it is easy to postpone. Its purpose is to prevent a rare event from destroying years of progress. The right cover depends on circumstances, but the principle is consistent: insure losses that would be catastrophic and accept smaller losses that can be absorbed. Paying to protect against every inconvenience is usually too expensive.',
      'Income growth is helpful but not a substitute for discipline. When income rises, a new recurring expense often appears to absorb the increase. Deciding in advance what share of any raise will go to savings, debt, or a specific goal prevents that drift. The decision can be simple. The important part is making it before the money is available to spend.',
      'A review date turns the plan into a working tool. The review asks what changed, what assumptions still hold, and which goal no longer matters. Plans fail when they are treated as permanent documents. A short review every few months keeps the plan honest and makes adjustments cheaper than a crisis.',
      'A plan should also include a simple rule for windfalls. A tax refund, a bonus, or an unexpected gift is easy to spend before it has been assigned a purpose. Deciding in advance what share goes to the reserve, what share goes to debt, and what share may be enjoyed turns a pleasant surprise into progress. The rule does not need to be strict. It needs to exist before the money arrives.',
      'Sharing the plan with another person can reveal assumptions that were never questioned. A partner may know about a future expense, a family obligation, or a risk that the planner has overlooked. The conversation is easier when the plan is already on paper, because the discussion is about specific choices rather than general anxiety. It is also a chance to agree on what each person will do when a decision has to be made quickly.',
      'The most reliable financial plan is not the most detailed one. It is the one a person can understand, repeat, and adjust. It starts with fixed obligations, makes room for a reserve, treats expensive debt seriously, uses insurance and sinking funds for protection, and reviews its assumptions before they become outdated. None of these steps requires special knowledge. They require honesty about the present and a willingness to make small decisions before a large one is forced.',
    ],
  },
];

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function chapterXhtml(chapter) {
  const body = chapter.paragraphs.map((text) => `    <p>${escapeXml(text)}</p>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(chapter.title)}</title>
  </head>
  <body>
    <h1>${escapeXml(chapter.title)}</h1>
${body}
  </body>
</html>
`;
}

const containerXml = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`;

const manifest = chapters
  .map((chapter) => `    <item id="${chapter.id}" href="${chapter.id}.xhtml" media-type="application/xhtml+xml" />`)
  .join('\n');
const spine = chapters.map((chapter) => `    <itemref idref="${chapter.id}" />`).join('\n');

const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:2f7a2b1e-9d65-4e3d-8b0a-3f6c1d2e4a01</dc:identifier>
    <dc:title>Financial Habits for Ordinary Months</dc:title>
    <dc:creator>Unbookin Fixtures</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>
`;

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime() {
  const now = new Date(2026, 0, 1, 0, 0, 0);
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { time, date };
}

function zip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data, 'utf8');
    const crc = crc32(data);
    const { time, date } = dosDateTime();
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

const entries = [
  { name: 'mimetype', data: 'application/epub+zip' },
  { name: 'META-INF/container.xml', data: containerXml },
  { name: 'OEBPS/content.opf', data: contentOpf },
  ...chapters.map((chapter) => ({
    name: `OEBPS/${chapter.id}.xhtml`,
    data: chapterXhtml(chapter),
  })),
];

writeFileSync(output, zip(entries));
console.log(`Wrote ${output}`);
