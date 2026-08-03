import { branchSettings } from './branch.js';

class Store {
  constructor() {
    this.listeners = new Set();
    this.state = {
      currentView: 'dashboard',
      activeChannel: 'all',
      searchTerm: '',
      attendanceHistoryTerm: '',
      user: null,
      profile: null,
      role: null,
      employeeCode: null,
      department: null,
      notifications: [],
      settings: {
        ...branchSettings(),
        googleGasUrl: '',
        gasLastSync: '',
        revenueTarget: 1200000000,
        monthlyPayrollCycle: 'Chốt công ngày 25 hằng tháng, duyệt lương cuối tháng.',
        managerNote: 'Ưu tiên vận hành: chấm công GPS đúng bán kính, task phải có người chịu trách nhiệm, nghỉ phép cần duyệt trước ca, các phòng MKT/NS/KT/DVKH/BS/Phụ tá/Bảo vệ/Lao công đều dùng chung một luồng theo dõi.',
      }
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  updateUser(authInfo) {
    this.state.user = authInfo.user;
    this.state.profile = authInfo.profile;
    this.state.role = authInfo.profile?.role || null;
    this.state.employeeCode = authInfo.profile?.employee_code || null;
    this.state.department = authInfo.profile?.department || null;
    this.notify();
  }

  setView(view) {
    this.state.currentView = view;
    this.notify();
  }

  setActiveChannel(channel) {
    this.state.activeChannel = channel;
    this.notify();
  }

  setSearchTerm(term) {
    this.state.searchTerm = term;
    this.notify();
  }

  setAttendanceHistoryTerm(term) {
    this.state.attendanceHistoryTerm = term;
    this.notify();
  }

  updateSettings(settings) {
    this.state.settings = { ...this.state.settings, ...settings };
    this.notify();
  }

  setNotifications(notifications) {
    this.state.notifications = notifications;
    this.notify();
  }

  addNotification(notification) {
    // Avoid duplicates
    if (this.state.notifications.some(n => n.id === notification.id)) return;
    this.state.notifications = [notification, ...this.state.notifications];
    this.notify();
  }

  getState() {
    return this.state;
  }
}

export const store = new Store();
