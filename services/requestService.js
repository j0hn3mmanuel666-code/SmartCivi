import { randomBytes, timingSafeEqual } from "crypto";
import { Op } from "sequelize";
import {
  DocumentCategory,
  DocumentRecord,
  DocumentRequest,
  Notification,
  StatusHistory,
} from "../models/documentModel.js";
import { User, sequelize } from "../models/userModel.js";
import { HttpError } from "../middleware/http.js";

export const requestStatuses = [
  "Submitted",
  "Under Review",
  "Correction Requested",
  "Approved",
  "Rejected",
  "Ready for Release",
  "Released",
];

const staffRoles = ["staff", "admin"];
const statusClassNames = {
  Submitted: "blue",
  "Under Review": "review",
  "Correction Requested": "amber",
  Approved: "completed",
  Rejected: "rejected",
  "Ready for Release": "violet",
  Released: "completed",
};
const allowedTransitions = {
  Submitted: ["Under Review", "Correction Requested"],
  "Under Review": ["Correction Requested", "Approved", "Rejected"],
  "Correction Requested": ["Submitted"],
  Approved: ["Ready for Release"],
  "Ready for Release": ["Released"],
  Rejected: [],
  Released: [],
};

const requestIncludes = [
  { model: DocumentCategory, as: "category" },
  { model: User, as: "applicant" },
  { model: User, as: "assignedStaff" },
];

const certificateDateLabels = {
  "Birth Certificate": "Date of birth",
  "Death Certificate": "Date of death",
  "Marriage Certificate": "Date of marriage",
};

const toPlainRequest = (request) => {
  const plain = request.get({ plain: true });
  plain.certificateDate = plain.certificateDate || plain.applicantDateOfBirth;
  plain.certificateDateLabel = certificateDateLabels[plain.documentType] || "Certificate date";
  plain.statusClass = statusClassNames[plain.status] || "blue";
  plain.history?.forEach((entry) => {
    entry.displayDate = new Date(entry.createdAt).toLocaleString();
  });
  plain.displayDate = new Date(plain.createdAt).toLocaleDateString();
  plain.displayUpdated = new Date(plain.updatedAt).toLocaleString();
  return plain;
};

const addNotifications = async (users, request, message, transaction) => {
  const recipients = [...new Set(users.map((user) => user.id))];
  if (!recipients.length) return;
  await Notification.bulkCreate(
    recipients.map((userId) => ({ userId, requestId: request.id, message })),
    { transaction },
  );
};

export const listRequests = async (user, { status, query } = {}) => {
  const where = {};
  if (!staffRoles.includes(user.role)) where.applicantId = user.id;
  if (status && requestStatuses.includes(status)) where.status = status;
  if (query) {
    where[Op.or] = [
      { referenceNo: { [Op.like]: `%${query}%` } },
      { applicantName: { [Op.like]: `%${query}%` } },
      { documentType: { [Op.like]: `%${query}%` } },
    ];
  }
  const requests = await DocumentRequest.findAll({
    where,
    include: [
      ...requestIncludes,
      {
        model: StatusHistory,
        as: "history",
        include: [{ model: User, as: "changedBy" }],
        separate: true,
        order: [["createdAt", "DESC"]],
      },
    ],
    order: [["updatedAt", "DESC"]],
    limit: 500,
  });
  return requests.map(toPlainRequest);
};

export const getRequestForUser = async (id, user) => {
  const request = await DocumentRequest.findByPk(id, {
    include: [
      ...requestIncludes,
      {
        model: StatusHistory,
        as: "history",
        include: [{ model: User, as: "changedBy" }],
        separate: true,
        order: [["createdAt", "DESC"]],
      },
      { model: DocumentRecord, as: "record" },
    ],
  });
  if (!request) throw new HttpError(404, "The requested document could not be found.");
  if (!staffRoles.includes(user.role) && request.applicantId !== user.id) {
    throw new HttpError(403, "You do not have permission to view this request.");
  }
  return toPlainRequest(request);
};

export const submitRequest = async (input) => {
  const applicantName = String(input.applicantName || "").trim();
  const certificateDate = String(input.certificateDate || "").trim();
  const contactEmail = String(input.contactEmail || "").trim().toLowerCase();
  const documentType = String(input.documentType || "").trim();
  const contactInfo = String(input.contactInfo || "").trim();
  const purpose = String(input.purpose || "").trim();
  if (applicantName.length < 2 || applicantName.length > 120) {
    throw new HttpError(400, "Enter an applicant name between 2 and 120 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) || contactEmail.length > 190) {
    throw new HttpError(400, "Enter a valid contact email address.");
  }
  if (!documentType || !contactInfo) {
    throw new HttpError(400, "Choose a document type and provide a contact phone number.");
  }
  const phoneDigits = contactInfo.replace(/\D/g, "");
  if (contactInfo.length > 80) throw new HttpError(400, "Phone number must be 80 characters or fewer.");
  if (phoneDigits.length < 7 || phoneDigits.length > 15) throw new HttpError(400, "Enter a phone number containing 7 to 15 digits.");
  if (purpose.length > 5000) throw new HttpError(400, "Purpose must be 5,000 characters or fewer.");

  const category = await DocumentCategory.findOne({ where: { name: documentType, active: true } });
  if (!category) throw new HttpError(400, "Choose an active document category.");
  let requestCertificateDate = null;
  if (certificateDateLabels[category.name]) {
    const parsedDate = new Date(`${certificateDate}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(certificateDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== certificateDate) {
      throw new HttpError(400, `Enter a valid ${certificateDateLabels[category.name].toLowerCase()} for the ${category.name.toLowerCase()} request.`);
    }
    if (parsedDate > new Date(new Date().toISOString().slice(0, 10))) {
      throw new HttpError(400, `${certificateDateLabels[category.name]} cannot be in the future.`);
    }
    requestCertificateDate = certificateDate;
  }

  const transaction = await sequelize.transaction();
  try {
    const request = await DocumentRequest.create({
      referenceNo: `DT-${new Date().getFullYear()}-${randomBytes(12).toString("hex").toUpperCase()}`,
      documentType,
      applicantName,
      certificateDate: requestCertificateDate,
      contactEmail,
      contactInfo,
      purpose,
      applicantId: null,
      categoryId: category.id,
      status: "Submitted",
    }, { transaction });

    await StatusHistory.create({
      requestId: request.id,
      changedById: null,
      status: "Submitted",
      remarks: "Request submitted.",
    }, { transaction });

    const staff = await User.findAll({
      where: { role: { [Op.in]: staffRoles }, accountStatus: "active" },
      transaction,
    });
    await addNotifications(staff, request, `New ${documentType} request ${request.referenceNo} is ready for review.`, transaction);
    await transaction.commit();
    return request;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

const hasMatchingVerification = (storedPhone, suppliedPhone) => {
  const stored = Buffer.from(normalizePhone(storedPhone));
  const supplied = Buffer.from(normalizePhone(suppliedPhone));
  return stored.length >= 7 && stored.length === supplied.length && timingSafeEqual(stored, supplied);
};

export const getTrackedRequest = async (referenceNo, verificationPhone) => {
  const reference = String(referenceNo || "").trim().toUpperCase();
  const phone = String(verificationPhone || "").trim();
  if (!reference || reference.length > 32 || phone.length > 80 || !phone) {
    throw new HttpError(404, "We could not find a request matching those details.");
  }
  const request = await DocumentRequest.findOne({
    where: { referenceNo: reference },
    attributes: ["id", "referenceNo", "documentType", "contactInfo", "status", "createdAt", "updatedAt"],
    include: [{
      model: StatusHistory,
      as: "history",
      attributes: ["status", "remarks", "createdAt"],
      separate: true,
      order: [["createdAt", "DESC"]],
      limit: 1,
    }],
  });
  if (!request || !hasMatchingVerification(request.contactInfo, verificationPhone)) {
    throw new HttpError(404, "We could not find a request matching those details.");
  }
  const tracked = request.get({ plain: true });
  tracked.statusClass = statusClassNames[tracked.status] || "blue";
  tracked.isCorrectionRequested = tracked.status === "Correction Requested";
  tracked.latestRemarks = tracked.isCorrectionRequested ? tracked.history?.[0]?.remarks : "";
  tracked.displayDate = new Date(tracked.createdAt).toLocaleDateString();
  tracked.displayUpdated = new Date(tracked.updatedAt).toLocaleString();
  tracked.history?.forEach((entry) => {
    entry.displayDate = new Date(entry.createdAt).toLocaleString();
  });
  return tracked;
};

export const updateRequestStatus = async (request, actor, nextStatus, remarks, file) => {
  const note = String(remarks || "").trim();
  if (!allowedTransitions[request.status]?.includes(nextStatus)) {
    throw new HttpError(400, `A request cannot move from ${request.status} to ${nextStatus}.`);
  }
  if (nextStatus === "Submitted") {
    throw new HttpError(400, "Applicants must resubmit corrected requests from their request page.");
  }
  if (actor.role === "staff" && request.assignedStaffId && request.assignedStaffId !== actor.id) {
    throw new HttpError(403, "This request is assigned to another staff member.");
  }
  if (file && nextStatus !== "Released") {
    throw new HttpError(400, "A release file can only be attached when a request is released.");
  }
  if (nextStatus === "Released" && !file) {
    throw new HttpError(400, "Upload the processed document before marking this request as released.");
  }
  if (note.length > 3000) throw new HttpError(400, "Remarks must be 3,000 characters or fewer.");
  if (["Correction Requested", "Rejected"].includes(nextStatus) && !note) {
    throw new HttpError(400, "Provide a reason for requesting corrections or rejecting a request.");
  }

  const transaction = await sequelize.transaction();
  try {
    const current = await DocumentRequest.findByPk(request.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current || current.status !== request.status) {
      throw new HttpError(409, "This request was updated by someone else. Reload it before making another change.");
    }

    current.status = nextStatus;
    if (staffRoles.includes(actor.role) && !current.assignedStaffId) current.assignedStaffId = actor.id;
    if (nextStatus === "Released" && file) {
      const record = await DocumentRecord.findOne({ where: { requestId: request.id }, transaction });
      if (record) {
        record.resultPath = file.path;
        record.releaseDate = new Date();
        await record.save({ transaction });
      } else {
        await DocumentRecord.create({
          requestId: request.id,
          referenceNo: request.referenceNo,
          resultPath: file.path,
          releaseDate: new Date(),
        }, { transaction });
      }
    } else if (nextStatus === "Ready for Release" || nextStatus === "Released") {
      await DocumentRecord.findOrCreate({
        where: { requestId: request.id },
        defaults: { requestId: request.id, referenceNo: request.referenceNo },
        transaction,
      });
    }
    await current.save({ transaction });

    await StatusHistory.create({
      requestId: request.id,
      changedById: actor.id,
      status: nextStatus,
      remarks: note,
    }, { transaction });

    const applicant = await User.findByPk(request.applicantId, { transaction });
    const message = `Request ${request.referenceNo} is now ${nextStatus}${note ? `: ${note}` : "."}`;
    if (applicant) await addNotifications([applicant], request, message, transaction);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const resubmitRequest = async (request, input) => {
  if (request.status !== "Correction Requested") {
    throw new HttpError(400, "This request is not waiting for corrections.");
  }
  const purpose = String(input.purpose || "").trim();
  if (!purpose) throw new HttpError(400, "Provide the corrected purpose.");
  if (purpose.length > 5000) throw new HttpError(400, "Purpose must be 5,000 characters or fewer.");

  const transaction = await sequelize.transaction();
  try {
    const current = await DocumentRequest.findByPk(request.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!current || current.status !== "Correction Requested") {
      throw new HttpError(409, "This request has already changed. Reload the page and try again.");
    }
    current.status = "Submitted";
    current.purpose = purpose;
    await current.save({ transaction });
    await StatusHistory.create({
      requestId: current.id,
      changedById: null,
      status: "Submitted",
      remarks: "Applicant resubmitted the requested corrections.",
    }, { transaction });

    const staff = await User.findAll({
      where: { role: { [Op.in]: staffRoles }, accountStatus: "active" },
      transaction,
    });
    await addNotifications(staff, current, `Corrections for ${current.referenceNo} were resubmitted.`, transaction);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const resubmitTrackedRequest = async (referenceNo, verificationPhone, input) => {
  const request = await getTrackedRequest(referenceNo, verificationPhone);
  await resubmitRequest(request, input);
  request.status = "Submitted";
  request.statusClass = statusClassNames.Submitted;
  request.isCorrectionRequested = false;
  request.latestRemarks = "";
  request.displayUpdated = new Date().toLocaleString();
  return request;
};

export const getDashboardData = async (user) => {
  const counts = Object.fromEntries(requestStatuses.map((status) => [status, 0]));
  const requestWhere = staffRoles.includes(user.role) ? {} : { applicantId: user.id };
  const [requests, totalRequests, statusGroups, activeCount] = await Promise.all([
    listRequests(user),
    DocumentRequest.count({ where: requestWhere }),
    DocumentRequest.findAll({
      attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
      where: requestWhere,
      group: ["status"],
      raw: true,
    }),
    DocumentRequest.count({
      where: { ...requestWhere, status: { [Op.notIn]: ["Released", "Rejected"] } },
    }),
  ]);
  statusGroups.forEach((row) => { counts[row.status] = Number(row.count); });

  const categories = await DocumentCategory.findAll({ where: { active: true }, order: [["name", "ASC"]] });
  const notifications = await user.getNotifications({
    include: [{ model: DocumentRequest, as: "request" }],
    order: [["createdAt", "DESC"]],
    limit: 6,
  });
  const unreadCount = await Notification.count({ where: { userId: user.id, readAt: null } });

  const staffOverview = staffRoles.includes(user.role);
  const users = user.role === "admin"
    ? await User.findAll({ order: [["createdAt", "DESC"]] })
    : [];
  const categoryManagement = user.role === "admin"
    ? await DocumentCategory.findAll({ order: [["name", "ASC"]] })
    : [];

  return {
    requests,
    categories: categories.map((item) => item.get({ plain: true })),
    counts,
    users: users.map((item) => item.get({ plain: true })),
    categoryManagement: categoryManagement.map((item) => item.get({ plain: true })),
    notifications: notifications.map((item) => {
      const notification = item.get({ plain: true });
      notification.displayDate = new Date(notification.createdAt).toLocaleString();
      return notification;
    }),
    isApplicant: !staffOverview,
    isStaff: staffOverview,
    isAdmin: user.role === "admin",
    totalRequests,
    requestListTruncated: totalRequests > requests.length,
    activeCount,
    unreadCount,
  };
};

export const requestAllowedStatuses = (request) => allowedTransitions[request.status] || [];

export const markNotificationRead = async (notificationId, userId) => {
  const notification = await Notification.findOne({ where: { id: notificationId, userId } });
  if (!notification) throw new HttpError(404, "Notification not found.");
  if (!notification.readAt) {
    notification.readAt = new Date();
    await notification.save();
  }
};

export const getReportData = async () => {
  const allRequests = await DocumentRequest.findAll({ attributes: ["status", "documentType", "createdAt"] });
  const byStatus = Object.fromEntries(requestStatuses.map((status) => [status, 0]));
  const byCategory = {};
  const monthly = {};
  allRequests.forEach((request) => {
    byStatus[request.status] = (byStatus[request.status] || 0) + 1;
    byCategory[request.documentType] = (byCategory[request.documentType] || 0) + 1;
    const month = new Date(request.createdAt).toISOString().slice(0, 7);
    monthly[month] = (monthly[month] || 0) + 1;
  });
  return { total: allRequests.length, byStatus, byCategory, monthly };
};
