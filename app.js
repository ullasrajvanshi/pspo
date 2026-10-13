(function () {
  'use strict';

  const NUM_QUESTIONS = 40;
  const DURATION_MS = 30 * 60 * 1000;
  const PASS_PERCENT = 85;
  const STORAGE_KEY = 'pspo-practice-exam';
  const LETTERS = 'ABCDEFGH';

  // Drop duplicate questions (the book repeats a few across mock tests).
  const POOL = [];
  const seen = new Set();
  for (const q of window.QUESTIONS || []) {
    const key = q.question.toLowerCase();
    if (!seen.has(key)) { seen.add(key); POOL.push(q); }
  }
  const BY_ID = Object.fromEntries(POOL.map(q => [q.id, q]));

  let state = null;
  let timerHandle = null;
  let reviewFilter = 'all';

  const $ = id => document.getElementById(id);

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function fmtTime(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && Array.isArray(s.ids) && s.ids.every(id => BY_ID[id])) return s;
    } catch (e) { /* ignore corrupt state */ }
    return null;
  }

  function questions() { return state.ids.map(id => BY_ID[id]); }
  function isMulti(q) { return q.answer.length > 1; }
  function selected(i) { return state.answers[i] || []; }

  function isCorrect(q, sel) {
    return sel.length === q.answer.length && q.answer.every(a => sel.includes(a));
  }

  function letters(idxs) {
    return idxs.length ? idxs.slice().sort((a, b) => a - b).map(i => LETTERS[i]).join(', ') : '';
  }

  function show(screen) {
    for (const s of ['start', 'exam', 'results']) $('screen-' + s).classList.toggle('hidden', s !== screen);
    $('timer').classList.toggle('hidden', screen !== 'exam');
    window.scrollTo(0, 0);
  }

  // ---------- start ----------
  function renderStart() {
    $('detail-count').textContent = NUM_QUESTIONS;
    $('detail-pool').textContent = `${POOL.length} questions from 7 mock tests`;
    const saved = load();
    $('resume-box').classList.toggle('hidden', !(saved && !saved.finished && saved.endTime > Date.now()));
    show('start');
  }

  function startExam() {
    state = {
      ids: shuffle(POOL).slice(0, NUM_QUESTIONS).map(q => q.id),
      answers: {},
      bookmarks: [],
      current: 0,
      startTime: Date.now(),
      endTime: Date.now() + DURATION_MS,
      finished: false,
    };
    save();
    enterExam();
  }

  function enterExam() {
    show('exam');
    renderQuestion();
    tick();
    clearInterval(timerHandle);
    timerHandle = setInterval(tick, 250);
  }

  // ---------- exam ----------
  function tick() {
    const left = state.endTime - Date.now();
    $('timer-value').textContent = fmtTime(left);
    $('timer').classList.toggle('warning', left <= 5 * 60 * 1000 && left > 60 * 1000);
    $('timer').classList.toggle('critical', left <= 60 * 1000);
    if (left <= 0) finishExam(true);
  }

  function renderQuestion() {
    const qs = questions();
    const i = state.current;
    const q = qs[i];
    const multi = isMulti(q);
    const sel = selected(i);

    $('q-counter').textContent = `Question ${i + 1} of ${qs.length}`;
    $('q-text').textContent = q.question;
    // Many questions already carry their own "(choose ...)" instruction.
    $('q-hint').textContent = /\b(choose|select)\b/i.test(q.question) ? ''
      : (multi ? 'Choose all answers that apply.' : 'Choose the best answer.');
    $('q-bookmark').checked = state.bookmarks.includes(i);

    $('q-options').innerHTML = q.options.map((opt, k) => `
      <label class="option${sel.includes(k) ? ' selected' : ''}">
        <input type="${multi ? 'checkbox' : 'radio'}" name="opt" value="${k}"${sel.includes(k) ? ' checked' : ''}>
        <span>${escapeHtml(opt)}</span>
      </label>`).join('');

    $('btn-prev').disabled = i === 0;
    $('btn-next').disabled = i === qs.length - 1;
    renderNavigator();
  }

  function onOptionChange() {
    const inputs = [...$('q-options').querySelectorAll('input')];
    const sel = inputs.filter(x => x.checked).map(x => Number(x.value));
    if (sel.length) state.answers[state.current] = sel;
    else delete state.answers[state.current];
    inputs.forEach(x => x.parentElement.classList.toggle('selected', x.checked));
    save();
    renderNavigator();
  }

  function renderNavigator() {
    const n = state.ids.length;
    $('nav-grid').innerHTML = Array.from({ length: n }, (_, i) => {
      const cls = ['nav-btn'];
      if (selected(i).length) cls.push('answered');
      if (state.bookmarks.includes(i)) cls.push('bookmarked');
      if (i === state.current) cls.push('current');
      return `<button class="${cls.join(' ')}" data-q="${i}">${i + 1}</button>`;
    }).join('');
    const answered = Object.keys(state.answers).length;
    $('progress-text').textContent = `${answered} of ${n} answered`;
  }

  function goTo(i) {
    state.current = Math.max(0, Math.min(state.ids.length - 1, i));
    save();
    renderQuestion();
  }

  function confirmSubmit() {
    const n = state.ids.length;
    const unanswered = n - Object.keys(state.answers).length;
    const marked = state.bookmarks.length;
    const parts = [];
    if (unanswered) parts.push(`You have <strong>${unanswered}</strong> unanswered question${unanswered > 1 ? 's' : ''}.`);
    if (marked) parts.push(`You have <strong>${marked}</strong> bookmarked question${marked > 1 ? 's' : ''}.`);
    parts.push('Once submitted you cannot change your answers.');
    $('modal-text').innerHTML = parts.join(' ');
    $('modal').classList.remove('hidden');
  }

  function finishExam(timedOut) {
    clearInterval(timerHandle);
    $('modal').classList.add('hidden');
    state.finished = true;
    state.finishTime = Math.min(Date.now(), state.endTime);
    state.timedOut = !!timedOut;
    save();
    renderResults();
  }

  // ---------- results ----------
  function renderResults() {
    const qs = questions();
    const correct = qs.filter((q, i) => isCorrect(q, selected(i))).length;
    const pct = Math.round((correct / qs.length) * 100);
    const passed = pct >= PASS_PERCENT;

    const badge = $('result-badge');
    badge.className = 'result-badge ' + (passed ? 'pass' : 'fail');
    badge.textContent = (passed ? 'Passed' : 'Not passed') + (state.timedOut ? ' (time expired)' : '');
    $('res-score').textContent = pct + '%';
    $('res-correct').textContent = `${correct} / ${qs.length}`;
    $('res-time').textContent = fmtTime(state.finishTime - state.startTime);
    document.querySelector('.pass-note').textContent =
      `Passing score: ${PASS_PERCENT}% (${Math.ceil(qs.length * PASS_PERCENT / 100)} of ${qs.length})`;

    renderReviewList();
    show('results');
  }

  function renderReviewList() {
    const qs = questions();
    const html = qs.map((q, i) => {
      const sel = selected(i);
      const ok = isCorrect(q, sel);
      const marked = state.bookmarks.includes(i);
      if (reviewFilter === 'correct' && !ok) return '';
      if (reviewFilter === 'incorrect' && ok) return '';
      if (reviewFilter === 'bookmarked' && !marked) return '';

      const opts = q.options.map((opt, k) => {
        const isAns = q.answer.includes(k);
        const picked = sel.includes(k);
        const cls = isAns ? 'is-correct' : (picked ? 'is-wrong' : '');
        let tag = '';
        if (isAns && picked) tag = '✓ Your answer (correct)';
        else if (isAns) tag = '✓ Correct answer';
        else if (picked) tag = '✗ Your answer';
        return `<li class="${cls}"><span class="letter">${LETTERS[k]}.</span><span>${escapeHtml(opt)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</li>`;
      }).join('');

      const explanation = escapeHtml(q.explanation).replace(/\s*●\s*/g, '<br>• ');

      return `
        <article class="card review-item ${ok ? 'correct' : 'incorrect'}">
          <div class="review-head">
            <span class="review-num">Question ${i + 1}${marked ? ' 🔖' : ''}
              <span class="review-source">Mock Test ${q.test}, Q${q.num}</span></span>
            <span class="status ${ok ? 'correct' : 'incorrect'}">${ok ? 'Correct' : (sel.length ? 'Incorrect' : 'Not answered')}</span>
          </div>
          <p class="review-q">${escapeHtml(q.question)}</p>
          <ul class="review-options">${opts}</ul>
          <dl class="answer-summary">
            <dt>Your answer</dt><dd class="${ok ? 'right' : 'wrong'}">${sel.length ? letters(sel) : 'Not answered'}</dd>
            <dt>Correct answer</dt><dd class="right">${letters(q.answer)}</dd>
          </dl>
          <div class="explanation"><strong>Explanation</strong><p>${explanation}</p></div>
        </article>`;
    }).join('');
    $('review-list').innerHTML = html || '<p class="card">No questions match this filter.</p>';
  }

  // ---------- events ----------
  $('btn-start').addEventListener('click', startExam);
  $('btn-resume').addEventListener('click', () => { state = load(); enterExam(); });
  $('btn-prev').addEventListener('click', () => goTo(state.current - 1));
  $('btn-next').addEventListener('click', () => goTo(state.current + 1));
  $('q-options').addEventListener('change', onOptionChange);
  $('q-bookmark').addEventListener('change', e => {
    const i = state.current;
    state.bookmarks = state.bookmarks.filter(b => b !== i);
    if (e.target.checked) state.bookmarks.push(i);
    save();
    renderNavigator();
  });
  $('nav-grid').addEventListener('click', e => {
    const b = e.target.closest('[data-q]');
    if (b) goTo(Number(b.dataset.q));
  });
  $('btn-submit').addEventListener('click', confirmSubmit);
  $('modal-cancel').addEventListener('click', () => $('modal').classList.add('hidden'));
  $('modal-confirm').addEventListener('click', () => finishExam(false));
  $('btn-retake').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); state = null; renderStart(); });
  document.querySelector('.filters').addEventListener('click', e => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    reviewFilter = chip.dataset.filter;
    document.querySelectorAll('.filters .chip').forEach(c => c.classList.toggle('active', c === chip));
    renderReviewList();
  });

  // ---------- init ----------
  const saved = load();
  if (saved && saved.finished) {
    state = saved;
    renderResults();
  } else if (saved && saved.endTime <= Date.now()) {
    // Time ran out while the page was closed: grade what was answered.
    state = saved;
    finishExam(true);
  } else {
    renderStart();
  }
})();
