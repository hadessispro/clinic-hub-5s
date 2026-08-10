import {
  getMessageContacts,
  getMessages,
  sendMessage,
  subscribeToIncomingMessages,
  conversationChannel,
  getRecentIncomingMessages,
} from '../services/messages.js';
import { escapeHTML, formatDateTime, departmentName } from '../utils.js';
import { showToast } from './toast.js';

let root = null;
let inboxSubscription = null;
let session = null;
let contacts = [];
let activeContact = null;
let unread = new Map();
let recentActivity = new Map();
let initGeneration = 0;

function unreadKey() { return `clinic_chat_unread:${session?.user?.id || ''}`; }
function checkedKey() { return `clinic_chat_checked:${session?.user?.id || ''}`; }
function activityKey() { return `clinic_chat_activity:${session?.user?.id || ''}`; }
function persistUnread() {
  if (!session?.user?.id) return;
  localStorage.setItem(unreadKey(), JSON.stringify(Object.fromEntries(unread)));
}

function meta(contact) {
  if (contact.userId === 'global') return 'Thông báo từ admin';
  const role = contact.role === 'admin' ? 'Admin' : contact.role === 'leader' ? 'Trưởng bộ phận' : 'Nhân viên';
  return [role, departmentName(contact.department), contact.title].filter(Boolean).join(' · ');
}

function totalUnread() {
  return [...unread.values()].reduce((sum, count) => sum + Number(count || 0), 0);
}

function updateBadge() {
  const badge = root?.querySelector('[data-smart-chat-badge]');
  const count = totalUnread();
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.hidden = count === 0;
}

function contactForMessage(message) {
  if (message.scope === 'global') return contacts.find((item) => item.userId === 'global');
  return contacts.find((item) => item.userId === message.senderId);
}

function renderContacts() {
  const list = root.querySelector('[data-smart-chat-body]');
  if (!list) return;
  list.classList.remove('is-conversation');
  const orderedContacts = [...contacts].sort((a, b) => {
    const unreadDifference = Number(unread.get(b.userId) || 0) - Number(unread.get(a.userId) || 0);
    if (unreadDifference) return unreadDifference;
    return Number(recentActivity.get(b.userId) || 0) - Number(recentActivity.get(a.userId) || 0);
  });
  list.innerHTML = `<div class="smart-chat-search"><input type="search" data-smart-chat-search placeholder="Tìm người liên hệ..." autocomplete="off"></div>
    <div class="smart-chat-contact-list" data-smart-chat-contacts>${orderedContacts.map((contact) => {
      const count = unread.get(contact.userId) || 0;
      return `<button type="button" class="smart-chat-contact" data-smart-chat-contact="${escapeHTML(contact.userId)}" data-search="${escapeHTML(`${contact.name} ${meta(contact)}`.toLowerCase())}">
        <span class="smart-chat-avatar">${escapeHTML(contact.name.trim().charAt(0).toUpperCase())}</span>
        <span class="smart-chat-contact-copy"><strong>${escapeHTML(contact.name)}</strong><small>${escapeHTML(meta(contact))}</small></span>
        ${count ? `<b>${count}</b>` : ''}
      </button>`;
    }).join('')}</div>`;

  list.querySelector('[data-smart-chat-search]')?.addEventListener('input', (event) => {
    const term = event.target.value.trim().toLowerCase();
    list.querySelectorAll('[data-smart-chat-contact]').forEach((button) => {
      button.hidden = term && !button.dataset.search.includes(term);
    });
  });
  list.querySelectorAll('[data-smart-chat-contact]').forEach((button) => {
    button.addEventListener('click', () => openConversation(button.dataset.smartChatContact));
  });
}

function renderMessage(message, contact) {
  const mine = message.senderId === session.user.id;
  return `<article class="smart-chat-message${mine ? ' is-own' : ''}">
    <strong>${mine ? 'Bạn' : escapeHTML(contact?.name || 'Admin')}</strong>
    <p>${escapeHTML(message.text)}</p><small>${formatDateTime(message.time)}</small>
  </article>`;
}

async function openConversation(contactId) {
  activeContact = contacts.find((item) => item.userId === contactId);
  if (!activeContact) return;
  unread.delete(contactId);
  persistUnread();
  updateBadge();
  const body = root.querySelector('[data-smart-chat-body]');
  body.classList.add('is-conversation');
  const title = root.querySelector('[data-smart-chat-title]');
  title.textContent = activeContact.name;
  body.innerHTML = '<div class="smart-chat-loading">Đang tải hội thoại...</div>';
  try {
    const messages = await getMessages(contactId, session.user.id);
    const canSend = contactId !== 'global' || session.profile.role === 'admin';
    body.innerHTML = `<div class="smart-chat-messages" data-smart-chat-messages>${messages.length ? messages.map((message) => renderMessage(message, activeContact)).join('') : '<div class="smart-chat-empty">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.</div>'}</div>
      ${canSend ? '<form class="smart-chat-form" data-smart-chat-form><input required maxlength="2000" placeholder="Nhập tin nhắn..." autocomplete="off"><button type="submit">Gửi</button></form>' : '<div class="smart-chat-readonly">Chỉ admin được gửi thông báo toàn hệ thống.</div>'}`;
    const messageList = body.querySelector('[data-smart-chat-messages]');
    if (messageList) messageList.scrollTop = messageList.scrollHeight;
    body.querySelector('[data-smart-chat-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      try {
        const sent = await sendMessage({ contactId, userId: session.user.id, author: session.profile.employee_code, text });
        messageList.querySelector('.smart-chat-empty')?.remove();
        messageList.insertAdjacentHTML('beforeend', renderMessage(sent, activeContact));
        input.value = '';
        messageList.scrollTop = messageList.scrollHeight;
      } catch (error) {
        console.error('[Smart Chat] Send failed:', error);
        input.setCustomValidity('Không gửi được tin nhắn đến người này.');
        input.reportValidity();
        input.setCustomValidity('');
      } finally {
        input.disabled = false;
        input.focus();
      }
    });
  } catch (error) {
    console.error('[Smart Chat] Load failed:', error);
    body.innerHTML = '<div class="smart-chat-empty">Không tải được hội thoại. Vui lòng thử lại.</div>';
  }
}

function setOpen(open) {
  const panel = root.querySelector('[data-smart-chat-panel]');
  const launcher = root.querySelector('[data-smart-chat-launcher]');
  panel.hidden = !open;
  launcher.setAttribute('aria-expanded', String(open));
  if (root) root.classList.toggle('is-open', open);
  if (open && !activeContact) renderContacts();
}

export async function initSmartChat(authInfo) {
  destroySmartChat();
  const generation = initGeneration;
  if (!authInfo?.user || !authInfo?.profile) return;
  session = authInfo;
  const allowed = await getMessageContacts().catch(() => []);
  if (generation !== initGeneration) return;
  contacts = [{ userId: 'global', name: 'Thông báo toàn hệ thống', role: 'admin', department: '', title: '' }, ...allowed];
  try {
    unread = new Map(Object.entries(JSON.parse(localStorage.getItem(unreadKey()) || '{}')));
    recentActivity = new Map(Object.entries(JSON.parse(localStorage.getItem(activityKey()) || '{}')));
  } catch {
    unread = new Map();
    recentActivity = new Map();
  }
  const lastChecked = localStorage.getItem(checkedKey()) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const missedMessages = await getRecentIncomingMessages(session.user.id, lastChecked).catch(() => []);
  missedMessages.forEach((message) => {
    const contact = contactForMessage(message);
    if (contact) {
      unread.set(contact.userId, Number(unread.get(contact.userId) || 0) + 1);
      recentActivity.set(contact.userId, new Date(message.time).getTime());
    }
  });
  localStorage.setItem(checkedKey(), new Date().toISOString());
  persistUnread();
  localStorage.setItem(activityKey(), JSON.stringify(Object.fromEntries(recentActivity)));
  root = document.createElement('div');
  root.className = 'smart-chat';
  root.innerHTML = `<section class="smart-chat-panel" data-smart-chat-panel hidden>
      <header><button type="button" data-smart-chat-back aria-label="Danh bạ">‹</button><div><strong data-smart-chat-title>Tin nhắn</strong><small>Kết nối đúng người, đúng bộ phận</small></div><button type="button" data-smart-chat-close aria-label="Đóng">×</button></header>
      <div class="smart-chat-body" data-smart-chat-body></div>
    </section>
    <button class="smart-chat-launcher" type="button" data-smart-chat-launcher aria-label="Mở tin nhắn" aria-expanded="false"><span>💬</span><b data-smart-chat-badge hidden>0</b></button>`;
  document.body.appendChild(root);
  updateBadge();
  root.querySelector('[data-smart-chat-launcher]').addEventListener('click', () => setOpen(root.querySelector('[data-smart-chat-panel]').hidden));
  root.querySelector('[data-smart-chat-close]').addEventListener('click', () => setOpen(false));
  root.querySelector('[data-smart-chat-back]').addEventListener('click', () => {
    activeContact = null;
    root.querySelector('[data-smart-chat-title]').textContent = 'Tin nhắn';
    renderContacts();
  });
  renderContacts();

  inboxSubscription = subscribeToIncomingMessages(session.user.id, (message) => {
    const contact = contactForMessage(message);
    if (!contact) return;
    localStorage.setItem(checkedKey(), new Date().toISOString());
    recentActivity.set(contact.userId, new Date(message.time).getTime());
    localStorage.setItem(activityKey(), JSON.stringify(Object.fromEntries(recentActivity)));
    showToast(`💬 ${contact.name}: ${message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text}`, false, 'chat');
    const isOpenConversation = !root.querySelector('[data-smart-chat-panel]').hidden
      && activeContact?.userId === contact.userId
      && conversationChannel(session.user.id, contact.userId) === message.channel;
    if (isOpenConversation) {
      const list = root.querySelector('[data-smart-chat-messages]');
      list?.querySelector('.smart-chat-empty')?.remove();
      list?.insertAdjacentHTML('beforeend', renderMessage(message, contact));
      if (list) list.scrollTop = list.scrollHeight;
    } else {
      unread.set(contact.userId, (unread.get(contact.userId) || 0) + 1);
      persistUnread();
      updateBadge();
      if (!root.querySelector('[data-smart-chat-panel]').hidden && !activeContact) renderContacts();
      if (message.scope === 'direct') {
        setOpen(true);
        openConversation(contact.userId);
      }
    }
  });
}

export function destroySmartChat() {
  initGeneration += 1;
  if (inboxSubscription) inboxSubscription.unsubscribe();
  inboxSubscription = null;
  root?.remove();
  root = null;
  session = null;
  contacts = [];
  activeContact = null;
  unread = new Map();
  recentActivity = new Map();
}
