import { DocumentRequest, Notification } from "../models/documentModel.js";

const pageHeadings = {
  overview: "Overview",
  activity: "Activity & alerts",
  reports: "Reports",
  admin: "Administration",
};

export const getWorkspacePageData = async (user, currentPage, data) => {
  if (!data) {
    const isStaff = ["staff", "admin"].includes(user.role);
    const requestWhere = isStaff ? {} : { applicantId: user.id };
    const [totalRequests, unreadCount] = await Promise.all([
      DocumentRequest.count({ where: requestWhere }),
      Notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    data = {
      totalRequests,
      unreadCount,
      isApplicant: !isStaff,
      isStaff,
      isAdmin: user.role === "admin",
    };
  }
  const nameParts = user.name.split(/\s+/);
  return {
    ...data,
    currentPage,
    pageHeading: pageHeadings[currentPage],
    greeting: nameParts[0],
    userInitials: nameParts.slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    currentDate: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    isOverview: currentPage === "overview",
    isActivity: currentPage === "activity",
    isReports: currentPage === "reports",
    isAdminPage: currentPage === "admin",
  };
};
