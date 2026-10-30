import { getDashboardData, getReportData, listRequests } from "../services/requestService.js";
import { getWorkspacePageData } from "../services/workspacePage.js";
import { asyncHandler } from "../middleware/http.js";

const pageTitle = "DocuTrack: Civil Document Processing and Tracking System";

export const homePage = (req, res) => {
  res.render("home", {
    title: pageTitle,
    isStaff: Boolean(req.user),
  });
};

export const dashboardPage = asyncHandler(async (req, res) => {
  const data = await getDashboardData(req.user);
  res.render("workspace", {
    ...await getWorkspacePageData(req.user, "overview", data),
    title: pageTitle,
    message: req.query.message,
  });
});

export const reportPage = asyncHandler(async (req, res) => {
  const [report, workspace] = await Promise.all([
    getReportData(),
    getWorkspacePageData(req.user, "reports"),
  ]);
  const categoryRows = Object.entries(report.byCategory);
  const monthRows = Object.entries(report.monthly).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  const categoryMax = Math.max(1, ...categoryRows.map(([, count]) => count));
  const monthMax = Math.max(1, ...monthRows.map(([, count]) => count));
  res.render("reports", {
    ...workspace,
    title: `Reports | ${pageTitle}`,
    report,
    statuses: Object.entries(report.byStatus).map(([name, count]) => ({ name, count })),
    categories: categoryRows.map(([name, count]) => ({ name, count, percent: Math.round(count / categoryMax * 100) })),
    months: monthRows.map(([name, count]) => ({ name, count, percent: Math.round(count / monthMax * 100) })),
  });
});

export const activityPage = asyncHandler(async (req, res) => {
  const [workspace, requests] = await Promise.all([
    getWorkspacePageData(req.user, "activity"),
    listRequests(req.user),
  ]);
  const activities = requests.flatMap((request) =>
    (request.history || []).map((history) => ({
      ...history,
      referenceNo: request.referenceNo,
      documentType: request.documentType,
    })),
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render("activity", {
    ...workspace,
    title: `Activity log | ${pageTitle}`,
    activities,
  });
});
