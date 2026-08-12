import { getMessages, sendMessage, subscribeToMessages, subscribeToIncomingMessages, getMessageContacts } from '../services/messages.js';
import { store } from '../store.js';
import { escapeHTML, formatDateTime, departmentName } from '../utils.js';
import { pill, emptyState } from '../components/shared.js';
import { showNotice } from '../components/app-dialog.js';

let contactsList = [];
let selectedContactId = null;
let activeSubscription = null;
let inboxSubscription = null;

function promoteContact(contactId, markUnread = false) {
  const button = document.querySelector(`[data-contact-id="${CSS.escape(contactId)}"]`);
  const list = button?.parentElement;
  if (!button || !list) return;
  list.prepend(button);
  if (!markUnread) {
    button.querySelector('[data-contact-unread]')?.remove();
    return;
  }
  let badge = button.querySelector('[data-contact-unread]');
  if (!badge) {
    badge = document.createElement('b');
    badge.dataset.contactUnread = 'true';
    badge.className = 'contact-unread-badge';
    badge.textContent = '0';
    button.appendChild(badge);
  }
  badge.textContent = String(Number(badge.textContent || 0) + 1);
}

function roleLabel(role) {
  if (role === 'admin') return 'Admin toàn hệ thống';
  if (role === 'leader') return 'Trưởng bộ phận';
  return 'Nhân viên';
}

function contactMeta(contact) {
  return [roleLabel(contact.role), departmentName(contact.department), contact.title]
    .filter(Boolean).join(' · ');
}

function renderMessage(msg, state, selectedContact) {
  const mine = msg.senderId === state.user?.id;
  const authorName = mine ? 'Bạn' : (selectedContact?.name || 'Admin');
  return `<article class="message-card${mine ? ' is-own' : ''}">
    <div class="message-head"><strong>${escapeHTML(authorName)}</strong><span class="message-time">${formatDateTime(msg.time)}</span></div>
    <p>${escapeHTML(msg.text)}</p>
  </article>`;
}

export async function renderView(state) {
  const contacts = await getMessageContacts();
  const globalContact = { userId: 'global', name: 'Thông báo toàn hệ thống', role: 'admin', department: '', title: 'Admin gửi đến tất cả nhân sự' };
  contactsList = [globalContact, ...contacts];

  const requested = state.activeChannel;
  selectedContactId = contactsList.some((item) => item.userId === requested)
    ? requested
    : (state.role === 'admin' ? 'global' : (contacts[0]?.userId || 'global'));
  const selectedContact = contactsList.find((item) => item.userId === selectedContactId);
  const messages = await getMessages(selectedContactId, state.user.id);
  const canCompose = selectedContactId !== 'global' || state.role === 'admin';

  return `<div class="view-header"><div><p class="eyebrow">Tin nhắn có kiểm soát</p>
    <h3>${state.role === 'admin' ? 'Admin có thể liên hệ toàn bộ hệ thống.' : state.role === 'leader' ? 'Liên hệ nhân viên thuộc bộ phận và admin.' : 'Liên hệ trưởng bộ phận phụ trách hoặc admin.'}</h3></div></div>
    <div class="split-layout chat-directory-layout">
      <aside class="panel"><div class="section-title"><h3>Liên hệ</h3>${pill(contactsList.length)}</div>
        <div class="channel-list vertical-contact-list" aria-label="Danh sách liên hệ từ trên xuống">${contactsList.map((contact) => `
          <button class="channel-button${contact.userId === selectedContactId ? ' active' : ''}" type="button" data-contact-id="${escapeHTML(contact.userId)}">
            <span><strong>${escapeHTML(contact.name)}</strong><small>${escapeHTML(contactMeta(contact))}</small></span>
          </button>`).join('')}</div>
      </aside>
      <section class="panel"><div class="section-title"><div><h3>${escapeHTML(selectedContact.name)}</h3><p class="subtle">${escapeHTML(contactMeta(selectedContact))}</p></div>${pill(`${messages.length} tin`)}</div>
        <div class="chat-window"><div class="message-list" id="messageList">${messages.length ? messages.map((msg) => renderMessage(msg, state, selectedContact)).join('') : emptyState()}</div>
          ${canCompose ? `<form class="chat-form" id="chatForm"><input id="chatInput" name="text" required maxlength="2000" placeholder="Nhập tin nhắn gửi đến ${escapeHTML(selectedContact.name)}..." autocomplete="off"/><button class="primary-button" type="submit">Gửi</button></form>` : '<div class="profile-lock"><strong>Chỉ admin được gửi thông báo toàn hệ thống.</strong><span>Bạn có thể đọc các thông báo đã nhận tại đây.</span></div>'}
        </div></section>
    </div>`;
}

export function initView() {
  const state = store.getState();
  const messageList = document.getElementById('messageList');
  if (messageList) messageList.scrollTop = messageList.scrollHeight;

  document.querySelectorAll('[data-contact-id]').forEach((button) => {
    button.addEventListener('click', () => store.setActiveChannel(button.dataset.contactId));
  });

  const form = document.getElementById('chatForm');
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      await sendMessage({ contactId: selectedContactId, userId: state.user.id, author: state.employeeCode, text });
      input.value = '';
      promoteContact(selectedContactId);
    } catch (error) {
      console.error('[Chat] Send failed:', error);
      await showNotice('Không gửi được tin nhắn hoặc người nhận nằm ngoài phạm vi liên hệ.', { title: 'Không thể gửi tin nhắn', tone: 'danger' });
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  if (activeSubscription) activeSubscription.unsubscribe();
  activeSubscription = subscribeToMessages(selectedContactId, state.user.id, (message) => {
    const list = document.getElementById('messageList');
    if (!list) return;
    list.querySelector('.empty-state')?.remove();
    const contact = contactsList.find((item) => item.userId === selectedContactId);
    list.insertAdjacentHTML('beforeend', renderMessage(message, state, contact));
    list.scrollTop = list.scrollHeight;
  });

  if (inboxSubscription) inboxSubscription.unsubscribe();
  inboxSubscription = subscribeToIncomingMessages(state.user.id, (message) => {
    const contactId = message.scope === 'global' ? 'global' : message.senderId;
    promoteContact(contactId, contactId !== selectedContactId);
  });
}
