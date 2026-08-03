import { getProposals, createProposal, updateProposal } from '../services/proposals.js';
import { getEmployees } from '../services/employees.js';
import { uploadFile } from '../services/storage.js';
import { DEPARTMENTS, LEAVE_STATUS } from '../constants.js';
import { todayISO, escapeHTML, formatCurrency, formatDateTime, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedProposals = [];

function renderProposalCard(proposal) {
  const requester = cachedEmployees.find(e => e.id === proposal.requester);
  const attachment = proposal.proofUrl || proposal.attachmentUrl
    ? `<a href="${escapeHTML(proposal.proofUrl || proposal.attachmentUrl)}" target="_blank" rel="noreferrer">Mở file đính kèm</a>`
    : proposal.fileName
      ? escapeHTML(proposal.fileName)
      : "Không có";
  return `
    <article class="request-card">
      <div class="section-title">
        <h4>${escapeHTML(proposal.title)}</h4>
        ${statusPill(LEAVE_STATUS[proposal.status] || proposal.status, statusTone(proposal.status))}
      </div>
      <div class="request-meta">
        ${pill(proposal.type)}
        ${pill(departmentName(proposal.department))}
        ${pill(requester?.name || "Không rõ")}
        ${Number(proposal.amount) ? pill(formatCurrency(proposal.amount)) : pill("Không chi phí")}
        ${pill("Duyệt → account chính")}
      </div>
      <p class="subtle">${escapeHTML(proposal.reason)}</p>
      <p class="subtle">File đính kèm: ${attachment}</p>
      <div class="request-actions">
        <span class="subtle">Gửi lúc: ${formatDateTime(proposal.createdAt)}</span>
        ${proposal.status === "pending" ? `
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="proposal-approve" data-id="${escapeHTML(proposal.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="proposal-reject" data-id="${escapeHTML(proposal.id)}"><span>×</span>Từ chối</button>
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm } = state;
  const [proposals, employees] = await Promise.all([
    getProposals(),
    getEmployees()
  ]);

  cachedEmployees = employees;
  cachedProposals = proposals;

  // Filter based on search query
  const filteredProposals = proposals.filter(item => {
    if (!searchTerm) return true;
    const requester = employees.find(e => e.id === item.requester);
    const textToMatch = [
      item.title,
      item.type,
      departmentName(item.department),
      requester?.name,
      String(item.amount),
      item.reason,
      item.status
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  const pendingCount = proposals.filter((proposal) => proposal.status === "pending").length;

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Proposal workflow</p>
        <h3>Gửi đề xuất ý kiến, duyệt chi PNS hoặc duyệt chi MKT; hỗ trợ link và tên file đính kèm.</h3>
      </div>
      ${pill(`${pendingCount} phiếu chờ duyệt`)}
    </div>

    <section class="panel">
      <div class="section-title">
        <h3>Tạo phiếu đề xuất</h3>
        ${pill("Link/file lưu theo tên")}
      </div>
      <form class="form-grid three" data-form="proposal" id="proposalForm">
        <div class="form-field">
          <label for="proposalType">Loại phiếu</label>
          <select id="proposalType" name="type">
            <option>Đề xuất ý kiến</option>
            <option>Duyệt chi PNS</option>
            <option>Duyệt chi MKT</option>
          </select>
        </div>
        <div class="form-field">
          <label for="proposalDepartment">Phòng gửi</label>
          <select id="proposalDepartment" name="department">
            ${DEPARTMENTS.map(d => option(d.id, d.name)).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="proposalRequester">Người gửi</label>
          <select id="proposalRequester" name="requester">
            ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
          </select>
        </div>
        <div class="form-field full">
          <label for="proposalTitle">Tiêu đề</label>
          <input id="proposalTitle" name="title" required placeholder="VD: Duyệt chi chiến dịch MKT tháng 6" />
        </div>
        <div class="form-field">
          <label for="proposalAmount">Số tiền duyệt chi</label>
          <input id="proposalAmount" name="amount" type="number" min="0" value="0" />
        </div>
        <div class="form-field">
          <label for="proposalLink">Link đính kèm</label>
          <input id="proposalLink" name="attachmentUrl" type="url" placeholder="https://..." />
        </div>
        <div class="form-field">
          <label for="proposalFile">File đính kèm</label>
          <input id="proposalFile" name="fileAttachment" type="file" />
        </div>
        <div class="form-field full">
          <label for="proposalReason">Nội dung</label>
          <textarea id="proposalReason" name="reason" required placeholder="Lý do, chi tiết chi phí hoặc ý kiến đề xuất"></textarea>
        </div>
        <div class="form-field full">
          <button class="primary-button" type="submit"><span>+</span>Gửi phiếu</button>
        </div>
      </form>
    </section>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Danh sách phiếu</h3>
        <span class="subtle">${filteredProposals.length} phiếu</span>
      </div>
      <div class="grid cols-3 animate-fade">
        ${filteredProposals.length ? filteredProposals.map(renderProposalCard).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  const proposalForm = document.getElementById("proposalForm");
  if (proposalForm) {
    proposalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(proposalForm);
      const data = Object.fromEntries(formData.entries());
      const file = formData.get("fileAttachment");

      try {
        let attachmentUrl = data.attachmentUrl.trim();
        let fileName = "";

        if (file && file.size > 0) {
          const uploadRes = await uploadFile(file, "proposals");
          if (uploadRes) {
            attachmentUrl = uploadRes.url;
            fileName = uploadRes.name;
          }
        }

        await createProposal({
          type: data.type,
          title: data.title.trim(),
          department: data.department,
          requester: data.requester,
          amount: Number(data.amount || 0),
          attachmentUrl,
          fileName,
          status: "pending",
          reason: data.reason.trim()
        });

        showToast("Đã gửi phiếu đề xuất.");
        proposalForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Proposals View] createProposal failed:', err);
        showToast("Lỗi gửi đề xuất.", true);
      }
    });
  }

  document.querySelectorAll("[data-action='proposal-approve']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateProposal(id, { status: "approved" });
        showToast("Đã duyệt phiếu đề xuất.");
        store.notify();
      } catch (err) {
        console.error('[Proposals View] updateProposal (approve) failed:', err);
        showToast("Lỗi khi duyệt phiếu.", true);
      }
    });
  });

  document.querySelectorAll("[data-action='proposal-reject']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateProposal(id, { status: "rejected" });
        showToast("Đã từ chối phiếu đề xuất.");
        store.notify();
      } catch (err) {
        console.error('[Proposals View] updateProposal (reject) failed:', err);
        showToast("Lỗi khi từ chối phiếu.", true);
      }
    });
  });
}
