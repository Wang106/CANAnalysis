(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const policyVersion = '2026-09-20';
  let session = null;
  let cursor = null;
  const commentPrompt = $('#commentPrompt');
  const commentExpansion = $('#commentExpansion');
  const commentsOpen = !commentPrompt.disabled;

  function showExpandedPanel(panel) {
    $('#authCard').classList.toggle('hidden', panel !== 'auth');
    $('#commentComposer').classList.toggle('hidden', panel !== 'comment');
    $('#accountCard').classList.toggle('hidden', panel !== 'account');
  }
  function expandCommentEntry(panel = session ? 'comment' : 'auth') {
    if (!commentsOpen) return;
    commentExpansion.classList.remove('hidden');
    commentPrompt.setAttribute('aria-expanded', 'true');
    if (panel === 'auth') showTab('login');
    showExpandedPanel(panel);
  }
  commentPrompt.onclick = () => {
    if (!commentsOpen) return;
    if (!commentExpansion.classList.contains('hidden')) {
      commentExpansion.classList.add('hidden');
      commentPrompt.setAttribute('aria-expanded', 'false');
      return;
    }
    expandCommentEntry();
  };
  $('#accountSettingsButton').onclick = () => showExpandedPanel('account');
  $('#backToCommentButton').onclick = () => showExpandedPanel('comment');

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: {...(options.body instanceof FormData ? {} : {'Content-Type': 'application/json'}), ...(options.headers || {})},
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || '请求失败，请稍后重试');
    return data;
  }
  function status(node, message, type = '') { node.textContent = message; node.className = `community-status ${type}`; }
  function turnstileToken(form) { return form.querySelector('[name="cf-turnstile-response"]')?.value || ''; }
  function resetTurnstile() { if (window.turnstile) window.turnstile.reset(); }
  function showTab(name) {
    document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === name));
    $('#loginForm').classList.toggle('hidden', name !== 'login');
    $('#registerForm').classList.toggle('hidden', name !== 'register');
    $('#resetForm').classList.add('hidden');
    status($('#authStatus'), '');
  }
  document.querySelectorAll('[data-tab]').forEach(button => { button.onclick = () => showTab(button.dataset.tab); });

  async function initializeSecurity() {
    const config = await api('/api/config');
    if (!config.communityEnabled) throw new Error('社区功能正在配置中');
    if (!config.turnstileSiteKey) return;
    for (let attempt = 0; attempt < 50 && !window.turnstile; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    if (!window.turnstile) throw new Error('安全验证加载失败，请刷新页面');
    [['#loginTurnstile', 'login'], ['#registerTurnstile', 'register'], ['#resendTurnstile', 'resend-verification'], ['#forgotTurnstile', 'password-reset']]
      .forEach(([selector, action]) => window.turnstile.render(selector, {sitekey: config.turnstileSiteKey, action}));
  }
  async function refreshSession() {
    const data = await api('/api/auth/session');
    session = data.user;
    $('#commentForm').querySelector('button').disabled = !session;
    $('#sessionSummary').textContent = commentsOpen ? (session ? `${session.displayName}，点击后发表评论` : '点击后登录并参与讨论') : '暂未开放';
    if (!commentExpansion.classList.contains('hidden')) showExpandedPanel(session ? 'comment' : 'auth');
    if (session) {
      $('#accountName').textContent = `${session.displayName} · ${session.email}`;
      $('#profileForm').elements.displayName.value = session.displayName;
      $('#profileForm').elements.bio.value = session.bio || '';
    }
  }

  $('#loginForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); data.turnstileToken = turnstileToken(form);
    try { await api('/api/auth/login', {method: 'POST', body: JSON.stringify(data)}); form.reset(); await refreshSession(); await loadComments(true); showExpandedPanel('comment'); status($('#commentStatus'), '登录成功，可以发表评论了。', 'success'); }
    catch (error) { status($('#authStatus'), error.message, 'error'); } finally { resetTurnstile(); }
  };
  $('#registerForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const formData = new FormData(form); const data = Object.fromEntries(formData);
    data.crossBorderConsent = formData.get('crossBorderConsent') === 'on'; data.policyVersion = policyVersion; data.turnstileToken = turnstileToken(form);
    try { await api('/api/auth/register', {method: 'POST', body: JSON.stringify(data)}); form.reset(); status($('#authStatus'), '验证邮件已排队，请在30分钟内完成验证。', 'success'); }
    catch (error) { status($('#authStatus'), error.message, 'error'); } finally { resetTurnstile(); }
  };
  $('#resendForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); data.turnstileToken = turnstileToken(form);
    try { await api('/api/auth/resend-verification', {method: 'POST', body: JSON.stringify(data)}); status($('#authStatus'), '如账号存在且尚未验证，验证邮件已重新排队。', 'success'); }
    catch (error) { status($('#authStatus'), error.message, 'error'); } finally { resetTurnstile(); }
  };
  $('#forgotForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); data.turnstileToken = turnstileToken(form);
    try { await api('/api/auth/request-password-reset', {method: 'POST', body: JSON.stringify(data)}); status($('#authStatus'), '如账号存在，密码重置邮件已排队。', 'success'); }
    catch (error) { status($('#authStatus'), error.message, 'error'); } finally { resetTurnstile(); }
  };
  $('#resetForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    try { await api('/api/auth/reset-password', {method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form)))}); history.replaceState(null, '', '/aboutus#community'); form.reset(); showTab('login'); status($('#authStatus'), '密码已重置，请使用新密码登录。', 'success'); }
    catch (error) { status($('#authStatus'), error.message, 'error'); }
  };
  $('#logoutButton').onclick = async () => { await api('/api/auth/logout', {method: 'POST', body: '{}'}); await refreshSession(); await loadComments(true); showExpandedPanel('auth'); };
  $('#exportButton').onclick = async () => {
    try { const data = await api('/api/me/export'); const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'cananalysis-my-data.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
    catch (error) { status($('#accountStatus'), error.message, 'error'); }
  };
  async function uploadFile(file, purpose) { const body = new FormData(); body.append('file', file); body.append('purpose', purpose); return api('/api/files', {method: 'POST', body}); }
  $('#profileForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const data = {displayName: form.elements.displayName.value, bio: form.elements.bio.value};
    try { const avatar = form.elements.avatar.files[0]; if (avatar) data.avatarFileId = (await uploadFile(avatar, 'avatar')).id; await api('/api/me', {method: 'PATCH', body: JSON.stringify(data)}); form.elements.avatar.value = ''; await refreshSession(); status($('#accountStatus'), '个人资料已保存', 'success'); }
    catch (error) { status($('#accountStatus'), error.message, 'error'); }
  };
  $('#passwordForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    try { await api('/api/me/change-password', {method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form)))}); form.reset(); await refreshSession(); status($('#authStatus'), '密码已修改，请重新登录。', 'success'); }
    catch (error) { status($('#accountStatus'), error.message, 'error'); }
  };
  $('#deleteAccountButton').onclick = async () => {
    if (!confirm('账号资料、头像和附件将被删除；已有评论会以“已注销账号”保留。确定继续吗？')) return;
    const password = prompt('请输入当前密码确认注销账号'); if (!password) return;
    try { await api('/api/me', {method: 'DELETE', body: JSON.stringify({password})}); await refreshSession(); await loadComments(true); status($('#authStatus'), '账号已注销，评论已去身份化保留。', 'success'); }
    catch (error) { status($('#accountStatus'), error.message, 'error'); }
  };

  async function uploadCommentFiles(files) {
    const ids = [];
    for (const file of [...files].slice(0, 3)) { status($('#fileStatus'), `正在上传 ${file.name}…`); ids.push((await uploadFile(file, 'comment_attachment')).id); }
    status($('#fileStatus'), ids.length ? `已上传 ${ids.length} 个附件` : ''); return ids;
  }
  $('#commentForm').onsubmit = async event => {
    event.preventDefault(); if (!session) { status($('#commentStatus'), '请先登录并验证邮箱', 'error'); expandCommentEntry('auth'); return; } const form = event.currentTarget;
    try { const fileIds = await uploadCommentFiles(form.elements.files.files); await api('/api/comments', {method: 'POST', body: JSON.stringify({body: form.elements.body.value, fileIds})}); form.reset(); status($('#fileStatus'), ''); status($('#commentStatus'), '评论已发布', 'success'); await loadComments(true); }
    catch (error) { status($('#commentStatus'), error.message, 'error'); }
  };

  function renderComment(comment) {
    const article = document.createElement('article'); article.className = 'comment';
    const head = document.createElement('div'); head.className = 'comment-head'; const name = document.createElement('strong'); name.textContent = comment.display_name; const time = document.createElement('time'); time.textContent = new Date(comment.created_at).toLocaleString(); head.append(name, time);
    const body = document.createElement('div'); body.className = 'comment-body'; body.textContent = comment.body; article.append(head, body);
    if (comment.attachments?.length) { const files = document.createElement('div'); files.className = 'attachments'; for (const file of comment.attachments) { const link = document.createElement('a'); link.href = `/api/files/${encodeURIComponent(file.id)}`; link.textContent = file.original_name; files.append(link); } article.append(files); }
    const actions = document.createElement('div'); actions.className = 'comment-actions';
    if (comment.canDelete) { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger'; remove.textContent = '删除我的评论'; remove.onclick = () => deleteComment(comment.id); actions.append(remove); }
    const report = document.createElement('button'); report.type = 'button'; report.textContent = '举报'; report.onclick = () => reportComment(comment.id); actions.append(report); article.append(actions); return article;
  }
  async function loadComments(reset = false) {
    try { if (reset) cursor = null; const data = await api(`/api/comments?limit=20${cursor ? `&before=${encodeURIComponent(cursor)}` : ''}`); if (reset) $('#comments').replaceChildren(); data.comments.forEach(comment => $('#comments').append(renderComment(comment))); cursor = data.nextCursor; $('#moreButton').classList.toggle('hidden', !cursor); }
    catch (error) { status($('#commentStatus'), error.message, 'error'); }
  }
  async function deleteComment(id) {
    if (!confirm('确定删除这条评论及其附件吗？')) return;
    try { await api(`/api/comments/${encodeURIComponent(id)}`, {method: 'DELETE', body: '{}'}); status($('#commentStatus'), '评论已删除', 'success'); await loadComments(true); }
    catch (error) { status($('#commentStatus'), error.message, 'error'); }
  }
  async function reportComment(id) {
    if (!session) { expandCommentEntry('auth'); return; } const details = prompt('请说明举报原因（骚扰、仇恨、隐私泄露、垃圾信息、违法或其他）'); if (!details) return;
    try { await api(`/api/comments/${encodeURIComponent(id)}/reports`, {method: 'POST', body: JSON.stringify({reason: 'other', details})}); alert('举报已提交'); }
    catch (error) { alert(error.message); }
  }
  $('#moreButton').onclick = () => loadComments();
  async function consumeLinks() {
    const params = new URLSearchParams(location.search);
    if (params.has('verify')) { await api('/api/auth/verify-email', {method: 'POST', body: JSON.stringify({token: params.get('verify')})}); history.replaceState(null, '', '/aboutus#community'); expandCommentEntry('auth'); status($('#authStatus'), '邮箱验证成功，请登录。', 'success'); }
    if (params.has('reset')) { expandCommentEntry('auth'); $('#loginForm').classList.add('hidden'); $('#registerForm').classList.add('hidden'); $('#resetForm').classList.remove('hidden'); $('#resetForm').elements.token.value = params.get('reset'); }
  }
  initializeSecurity().then(consumeLinks).then(refreshSession).then(() => loadComments(true)).catch(error => { status($('#authStatus'), error.message, 'error'); status($('#commentStatus'), error.message, 'error'); $('#commentForm').querySelector('button').disabled = true; });
})();
