async (page, options = {}) => {
  const cfg = {
    platform: options.platform || 'auto',
    dashboardUrl: options.dashboardUrl || 'https://i.chaoxing.com/',
    maxCourses: options.maxCourses || 5,
    includeEmpty: options.includeEmpty || false,
  };

  const sleep = ms => page.waitForTimeout(ms);
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const redact = s => clean(s)
    .replace(/\b1[3-9]\d{9}\b/g, '[phone]')
    .replace(/\b\d{8,}\b/g, '[id]')
    .replace(/([?&](?:enc|cpi|clazzid|classId|courseid|courseId|uid|userid|userId|token|session|fid)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/https?:\/\/\S+/g, '[url]');

  async function frameTexts() {
    const chunks = [];
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const text = await frame.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (clean(text)) chunks.push(redact(text));
    }
    return chunks.join('\n');
  }

  async function clickByText(candidates) {
    for (const text of candidates) {
      try {
        await page.locator(`a[title="${text}"]`).first().click({ timeout: 2500 });
        await sleep(1200);
        return text;
      } catch {}
      try {
        await page.getByRole('link', { name: text }).first().click({ timeout: 2500 });
        await sleep(1200);
        return text;
      } catch {}
    }
    return '';
  }

  async function getChaoxingCourses() {
    await page.goto(cfg.dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    const frame = page.frames().find(f => f.url().includes('/visit/interaction'));
    if (!frame) return [];
    return await frame.evaluate(() => {
      const clean = s => (s || '').replace(/\s+/g, ' ').trim();
      return [...document.querySelectorAll('a.color1')].map(a => {
        let node = a, block = '';
        for (let i = 0; node && i < 5; i++, node = node.parentElement) {
          const text = clean(node.innerText || '');
          if (text.length > block.length) block = text;
        }
        return { name: clean(a.innerText), href: a.href, block };
      }).filter(x => x.name && !x.block.includes('Course has closed'));
    });
  }

  async function getGenericCourses() {
    await page.goto(cfg.dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);
    return await page.evaluate(() => {
      const clean = s => (s || '').replace(/\s+/g, ' ').trim();
      return [...document.querySelectorAll('a[href]')].map(a => {
        let node = a, block = '';
        for (let i = 0; node && i < 4; i++, node = node.parentElement) {
          const text = clean(node.innerText || '');
          if (text.length > block.length) block = text;
        }
        return { name: clean(a.innerText || a.getAttribute('aria-label') || a.title), href: a.href, block };
      }).filter(x => x.name && /course|class|课程|学习|module|dashboard/i.test(`${x.name} ${x.block}`));
    });
  }

  async function scanChaoxingChapters() {
    const frame = page.frames().find(f => f.url().includes('/studentcourse')) ||
      page.frames().find(f => f !== page.mainFrame());
    if (!frame) return { summary: '', unfinished: [] };
    return await frame.evaluate(() => {
      const clean = s => (s || '').replace(/\s+/g, ' ').trim();
      const body = clean(document.body.innerText);
      const summary = (body.match(/Tasks Completed:\s*\d+\/\d+/i) || [''])[0];
      const unfinished = [...document.querySelectorAll('.chapter_item')].map(el => {
        const num = clean(el.querySelector('.catalog_sbar')?.innerText);
        const title = clean(el.getAttribute('title') || el.querySelector('.clicktitle')?.innerText);
        const count = clean(el.querySelector('.knowledgeJobCount')?.value ||
          el.querySelector('.orangeNew')?.innerText || '');
        const done = !!el.querySelector('.icon_yiwanc');
        return { num, title, count, done };
      }).filter(x => x.num && x.count && !x.done)
        .map(x => `${x.num} ${x.title} (${x.count})`);
      return { summary, unfinished };
    }).catch(e => ({ summary: '', unfinished: [], error: String(e) }));
  }

  function parseWorkText(text) {
    const summary = (text.match(/\b\d+\/\d+\b/) || [''])[0];
    const pending = (text.match(/[^\n]{0,120}(?:To be Submitted|未提交|待提交|Uncompleted|未交|not submitted|missing|todo)[^\n]{0,80}/gi) || [])
      .map(redact)
      .filter(x => !/No assignment yet|Filter All Completed Uncompleted/i.test(x));
    return { summary, pending: [...new Set(pending)] };
  }

  function parseTaskText(text) {
    const active = [...text.matchAll(/([^\n]{2,140}?)\s*(?:Remaining|剩余)[:：]?\s*([^\n]+)/gi)]
      .map(m => redact(`${m[1]} Remaining:${m[2]}`));
    const generic = (text.match(/[^\n]{0,140}(?:in progress|进行中|未完成|待完成|due|截止)[^\n]{0,80}/gi) || [])
      .map(redact);
    return [...new Set([...active, ...generic])];
  }

  async function scanCourse(course, platform) {
    const item = { course: redact(course.name), work: {}, tasks: [], chapters: {} };
    await page.goto(course.href, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => item.error = String(e));
    await sleep(1600);

    if (platform === 'chaoxing') {
      if (await clickByText(['作业'])) item.work = parseWorkText(await frameTexts());
      if (await clickByText(['任务'])) item.tasks = parseTaskText(await frameTexts());
      if (await clickByText(['章节'])) item.chapters = await scanChaoxingChapters();
    } else {
      if (await clickByText(['Assignments', 'Homework', '作业'])) item.work = parseWorkText(await frameTexts());
      if (await clickByText(['Tasks', 'Activities', '任务'])) item.tasks = parseTaskText(await frameTexts());
      if (await clickByText(['Modules', 'Chapters', 'Progress', '章节', '学习进度'])) {
        const text = await frameTexts();
        item.chapters = {
          summary: (text.match(/(?:progress|completed|完成)[^\n]{0,40}\b\d+\/\d+\b/i) || [''])[0],
          unfinished: parseTaskText(text),
        };
      }
    }

    return item;
  }

  const platform = cfg.platform === 'auto'
    ? (cfg.dashboardUrl.includes('chaoxing') ? 'chaoxing' : 'generic')
    : cfg.platform;
  const courses = platform === 'chaoxing' ? await getChaoxingCourses() : await getGenericCourses();
  const results = [];
  for (const course of courses.slice(0, cfg.maxCourses)) {
    const item = await scanCourse(course, platform);
    const hasTodo = (item.work.pending?.length || item.tasks.length || item.chapters.unfinished?.length);
    if (hasTodo || cfg.includeEmpty) results.push(item);
  }
  return results;
}
