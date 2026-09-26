import { getMessages, sendMessage, subscribeToMessages, subscribeToIncomingMessages, getMessageContacts } from '../services/messages.js';
import { sendGeminiChatMessage } from '../services/system-admin.js';
import { store } from '../store.js';
import { escapeHTML, formatDateTime, departmentName } from '../utils.js';
import { pill, emptyState } from '../components/shared.js';
import { showNotice } from '../components/app-dialog.js';

let contactsList = [];
let selectedContactId = null;
let activeSubscription = null;
let inboxSubscription = null;
let mobileChatOpen = false;

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
  if (role === 'ai') return 'Trợ lý AI 24/7';
  if (role === 'admin') return 'Admin toàn hệ thống';
  if (role === 'leader') return 'Trưởng bộ phận';
  return 'Nhân viên';
}

function contactMeta(contact) {
  if (contact.isAi) return 'Bóc tách đơn & xin Sếp duyệt tự động';
  return [roleLabel(contact.role), departmentName(contact.department), contact.title]
    .filter(Boolean).join(' · ');
}

function renderMessage(msg, state, selectedContact) {
  const mine = msg.senderId === state.user?.id;
  const isAi = !mine && (msg.senderId === 'ai_assistant' || selectedContact?.userId === 'ai_assistant' || selectedContact?.isAi);
  const authorName = mine ? 'Bạn' : (isAi ? '✦ Trợ lý AI 5S' : (selectedContact?.name || 'Admin'));
  const avatarUrl = isAi ? '/images/ai-bot-avatar.jpg' : null;
  const initial = authorName.trim().charAt(0).toUpperCase();

  const action = msg.actionData;
  const isPending = action?.status === 'pending';
  const intentIcon = action?.intent === 'doi_ca_truc' ? '🔄' : action?.intent === 'bo_sung_cham_cong' ? '⏰' : '🏖️';

  return `<div class="chat-message-row${mine ? ' is-own' : ''}${isAi ? ' is-ai' : ''}" data-msg-id="${escapeHTML(msg.id || '')}">
    ${!mine ? `
      <div class="chat-avatar-wrap">
        ${avatarUrl ? `<img src="${avatarUrl}" alt="${escapeHTML(authorName)}" class="chat-avatar-img" />` : `<div class="chat-avatar-fallback">${escapeHTML(initial)}</div>`}
      </div>
    ` : ''}
    <div class="chat-message-content">
      <div class="chat-bubble-meta">
        <strong>${escapeHTML(authorName)}</strong>
        <span class="chat-time">${formatDateTime(msg.time)}</span>
      </div>
      <div class="chat-bubble">
        <p class="chat-text">${escapeHTML(msg.text)}</p>
        ${action ? `
          <div class="chat-action-card">
            <div class="action-card-header">
              <span class="action-title">${intentIcon} ${escapeHTML(action.intentLabel || 'Yêu cầu nhân sự')}</span>
              <span class="action-status-pill ${isPending ? 'pending' : 'approved'}">
                <i class="ri-${isPending ? 'time' : 'checkbox-circle'}-line"></i>
                ${isPending ? 'Chờ Sếp duyệt qua Telegram' : 'Đã duyệt thành công'}
              </span>
            </div>
            <div class="action-card-details">
              ${action.workDate ? `<div><i class="ri-calendar-line"></i> Ngày áp dụng: <b>${escapeHTML(action.workDate)}</b></div>` : ''}
              ${action.shift ? `<div><i class="ri-time-line"></i> Ca trực: <b>${escapeHTML(action.shift)}</b></div>` : ''}
              ${action.telegramSent ? `<div class="action-tg-note"><i class="ri-telegram-fill" style="color:#229ED9;"></i> Đã gửi thẻ duyệt sang Telegram cho Ban Giám Đốc</div>` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  </div>`;
}

export async function renderView(state) {
  const contacts = await getMessageContacts().catch(() => []);
  const globalContact = { userId: 'global', name: 'Thông báo toàn hệ thống', role: 'admin', department: '', title: 'Admin gửi đến tất cả nhân sự' };
  const aiContact = {
    userId: 'ai_assistant',
    name: '✦ Trợ lý AI 5S',
    role: 'ai',
    department: 'Clinic Hub 5S',
    title: 'Hỗ trợ xin nghỉ, đổi ca, bổ sung công 24/7',
    avatar: '/images/ai-bot-avatar.jpg',
    isAi: true,
  };
  contactsList = [aiContact, globalContact, ...contacts];

  const requested = state.activeChannel;
  if (requested && contactsList.some((item) => item.userId === requested)) {
    selectedContactId = requested;
  } else if (!selectedContactId || !contactsList.some((item) => item.userId === selectedContactId)) {
    selectedContactId = 'ai_assistant';
  }

  const selectedContact = contactsList.find((item) => item.userId === selectedContactId) || aiContact;
  const rawMessages = await getMessages(selectedContactId, state.user.id).catch(() => []);
  const messages = [];
  const seenIds = new Set();
  for (const m of rawMessages) {
    if (!m || !m.id || seenIds.has(m.id)) continue;
    seenIds.add(m.id);
    const prev = messages[messages.length - 1];
    if (prev && prev.senderId === m.senderId && prev.text?.trim() === m.text?.trim()) {
      continue;
    }
    messages.push(m);
  }
  const canCompose = selectedContactId !== 'global' || state.role === 'admin';
  const isAiChat = selectedContact.userId === 'ai_assistant' || selectedContact.isAi;

  return `<div class="view-header"><div><p class="eyebrow">Tin nhắn & Trợ lý thông minh</p>
    <h3>${selectedContact.isAi ? 'Trợ lý AI 5S hỗ trợ giải đáp và tạo đơn tự động chuyển Sếp duyệt' : (state.role === 'admin' ? 'Admin có thể liên hệ toàn bộ hệ thống.' : state.role === 'leader' ? 'Liên hệ nhân viên thuộc bộ phận và admin.' : 'Liên hệ trưởng bộ phận phụ trách hoặc admin.')}</h3></div></div>
    <div class="split-layout chat-directory-layout ${mobileChatOpen ? 'is-chat-active' : 'is-list-active'}">
      <aside class="panel chat-aside">
        <div class="panel-header">
          <h3 style="margin:0; font-size:1rem; display:flex; align-items:center; gap:6px;">
            <i class="ri-chat-smile-2-line" style="color:var(--teal);"></i> Danh bạ liên hệ
          </h3>
          ${pill(contactsList.length)}
        </div>
        <div class="channel-list vertical-contact-list" aria-label="Danh sách liên hệ">
          ${contactsList.map((contact) => `
            <button class="channel-button${contact.userId === selectedContactId ? ' active' : ''}${contact.isAi ? ' is-ai-contact' : ''}" type="button" data-contact-id="${escapeHTML(contact.userId)}">
              <div class="channel-avatar">
                ${contact.avatar 
                  ? `<img src="${escapeHTML(contact.avatar)}" alt="" class="avatar-img" />`
                  : `<span class="avatar-fallback">${escapeHTML(contact.name.charAt(0))}</span>`
                }
              </div>
              <div class="channel-meta-wrap">
                <strong style="${contact.isAi ? 'color:#0284c7; display:flex; align-items:center; gap:4px;' : ''}">
                  ${contact.isAi ? '<i class="ri-sparkling-fill" style="color:#0284c7; font-size:13px;"></i>' : ''}
                  ${escapeHTML(contact.name)}
                </strong>
                <small>${escapeHTML(contactMeta(contact))}</small>
              </div>
              ${contact.isAi ? '<span class="pill-chip-ai">AI 24/7</span>' : ''}
            </button>`).join('')}
        </div>
      </aside>
      <section class="panel chat-main-section">
        <div class="chat-header-bar">
          <div class="chat-header-user">
            <button type="button" class="chat-mobile-back-btn" id="btnChatMobileBack" aria-label="Quay lại">
              <i class="ri-arrow-left-s-line"></i> <span>Danh bạ</span>
            </button>
            <div class="channel-avatar" style="width:34px; height:34px;">
              ${selectedContact.avatar 
                ? `<img src="${escapeHTML(selectedContact.avatar)}" alt="" class="avatar-img" />`
                : `<span class="avatar-fallback">${escapeHTML(selectedContact.name.charAt(0))}</span>`
              }
            </div>
            <div>
              <strong style="${selectedContact.isAi ? 'color:#0284c7;' : ''}">
                ${selectedContact.isAi ? '<i class="ri-sparkling-fill" style="color:#0284c7; font-size:13px;"></i> ' : ''}${escapeHTML(selectedContact.name)}
              </strong>
              <p>${escapeHTML(contactMeta(selectedContact))}</p>
            </div>
          </div>
          ${pill(`${messages.length} tin`)}
        </div>
        <div class="chat-window">
          <div class="message-list" id="messageList">
            ${messages.length ? messages.map((msg) => renderMessage(msg, state, selectedContact)).join('') : emptyState()}
          </div>
          ${isAiChat ? `
            <div class="chat-quick-chips">
              <button type="button" class="quick-chip-btn" data-quick-text="Em xin nghỉ phép ngày mai do có việc gia đình ạ">
                <i class="ri-calendar-event-line"></i> 📝 Xin nghỉ phép
              </button>
              <button type="button" class="quick-chip-btn" data-quick-text="Hôm qua em quên bấm check-out lúc 18h30 ca chiều, xin bổ sung công ạ">
                <i class="ri-time-line"></i> ⏰ Bổ sung công
              </button>
              <button type="button" class="quick-chip-btn" data-quick-text="Em xin đổi ca trực chiều thứ 6 này ở PVC với đồng nghiệp ạ">
                <i class="ri-refresh-line"></i> 🔄 Đổi ca trực
              </button>
              <button type="button" class="quick-chip-btn" data-quick-text="Cho mình hỏi quy định ca làm việc và giờ trực tại phòng khám?">
                <i class="ri-questionnaire-line"></i> ❓ Quy chế ca làm
              </button>
            </div>
          ` : ''}
          ${canCompose ? `
            <form class="chat-form" id="chatForm">
              <input id="chatInput" class="chat-input" name="text" required maxlength="2000" placeholder="${isAiChat ? 'Nhắn tự nhiên: Đổi ca, quên bấm công, xin nghỉ...' : `Nhập tin nhắn gửi đến ${escapeHTML(selectedContact.name)}...`}" autocomplete="off"/>
              <button class="chat-send-btn" type="submit" title="Gửi tin nhắn">
                <i class="ri-send-plane-2-fill"></i>
              </button>
            </form>` : '<div class="profile-lock"><strong>Chỉ admin được gửi thông báo toàn hệ thống.</strong><span>Bạn có thể đọc các thông báo đã nhận tại đây.</span></div>'}
        </div>
      </section>
    </div>`;
}

export function initView() {
  const state = store.getState();
  const messageList = document.getElementById('messageList');
  if (messageList) messageList.scrollTop = messageList.scrollHeight;

  document.querySelectorAll('[data-contact-id]').forEach((button) => {
    button.addEventListener('click', () => {
      mobileChatOpen = true;
      store.setActiveChannel(button.dataset.contactId);
    });
  });

  document.getElementById('btnChatMobileBack')?.addEventListener('click', () => {
    mobileChatOpen = false;
    const layout = document.querySelector('.chat-directory-layout');
    if (layout) {
      layout.classList.remove('is-chat-active');
      layout.classList.add('is-list-active');
    }
  });

  document.querySelectorAll('.quick-chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-quick-text');
      const input = document.getElementById('chatInput');
      if (input && text) {
        input.value = text;
        input.focus();
      }
    });
  });

  const form = document.getElementById('chatForm');
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input?.value.trim();
    if (!text) return;
    input.disabled = true;

    const list = document.getElementById('messageList');
    const isAi = selectedContactId === 'ai_assistant';

    if (isAi) {
      // 1. Optimistic append user message
      const tempId = `temp_${Date.now()}`;
      const userMessage = {
        id: tempId,
        senderId: state.user.id,
        text,
        time: new Date().toISOString(),
      };
      list?.querySelector('.empty-state')?.remove();
      list?.insertAdjacentHTML('beforeend', renderMessage(userMessage, state, { userId: 'ai_assistant', isAi: true }));
      input.value = '';

      // 2. Add Typing Indicator
      const typingHtml = `<div id="aiTypingIndicator" class="ai-typing-indicator">
        <div class="chat-avatar-wrap"><img src="/images/ai-bot-avatar.jpg" alt="AI" class="chat-avatar-img"/></div>
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        <span class="typing-text">Trợ lý AI đang xử lý...</span>
      </div>`;
      list?.insertAdjacentHTML('beforeend', typingHtml);
      if (list) list.scrollTop = list.scrollHeight;

      try {
        const res = await sendGeminiChatMessage(text);
        document.getElementById('aiTypingIndicator')?.remove();

        // Update optimistic user message's data-msg-id so subscription doesn't re-insert it
        if (res?.userMessageId) {
          const tempNode = list?.querySelector(`[data-msg-id="${tempId}"]`);
          if (tempNode) tempNode.setAttribute('data-msg-id', res.userMessageId);
        }

        const aiMsgId = res?.aiMessageId || `ai_${Date.now()}`;
        const aiMessage = {
          id: aiMsgId,
          senderId: 'ai_assistant',
          text: res?.reply || 'Em đã ghi nhận yêu cầu của anh/chị rồi ạ!',
          actionData: res?.action ? {
            intent: res.action.intent,
            intentLabel: res.action.intentLabel,
            workDate: res.action.workDate,
            shift: res.action.shift,
            status: 'pending',
            telegramSent: res.telegramSent,
          } : null,
          time: new Date().toISOString(),
        };
        if (list && !list.querySelector(`[data-msg-id="${aiMsgId}"]`)) {
          const lastRow = list.querySelector('.chat-message-row:last-child');
          const lastText = lastRow?.querySelector('.chat-text')?.textContent?.trim();
          if (!lastText || lastText !== aiMessage.text.trim()) {
            list.insertAdjacentHTML('beforeend', renderMessage(aiMessage, state, { userId: 'ai_assistant', isAi: true }));
          } else if (lastRow) {
            lastRow.setAttribute('data-msg-id', aiMsgId);
          }
        }
        if (list) list.scrollTop = list.scrollHeight;
        promoteContact('ai_assistant');
      } catch (err) {
        document.getElementById('aiTypingIndicator')?.remove();
        console.error('[Chat AI Error]', err);
        await showNotice(err?.message || 'Trợ lý AI đang bận xử lý, vui lòng thử lại trong giây lát.', { title: 'Lỗi AI Chat', tone: 'danger' });
      } finally {
        input.disabled = false;
        input.focus();
      }
      return;
    }

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
    // Avoid duplicate if already in DOM by ID
    if (list.querySelector(`[data-msg-id="${message.id}"]`)) return;
    // Avoid duplicate if last message in list has identical text from same sender
    const lastRow = list.querySelector('.chat-message-row:last-child');
    if (lastRow) {
      const lastText = lastRow.querySelector('.chat-text')?.textContent?.trim();
      const isAiSender = message.senderId === 'ai_assistant';
      const lastIsAi = lastRow.classList.contains('is-ai');
      if (lastText && lastText === message.text?.trim() && (isAiSender === lastIsAi)) {
        lastRow.setAttribute('data-msg-id', message.id);
        return;
      }
    }
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

