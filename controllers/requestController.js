import fs from "fs";
import path from "path";
import {
  getRequestForUser,
  getTrackedRequest,
  requestAllowedStatuses,
  resubmitTrackedRequest,
  submitRequest,
  updateRequestStatus,
} from "../services/requestService.js";
import { DocumentCategory } from "../models/documentModel.js";
import { asyncHandler, HttpError } from "../middleware/http.js";
import { privateUploadDirectory, removeUploadedFile } from "../middleware/upload.js";
import { ensureDatabase } from "../services/database.js";

const viewName = "DocuTrack: Civil Document Processing and Tracking System";

const parseRequestId = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid document request.");
  return id;
};

const withUploadCleanup = (handler) => asyncHandler(async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    await removeUploadedFile(req.file);
    throw error;
  }
});

export const newRequestPage = asyncHandler(async (req, res) => {
  await ensureDatabase();
  const categories = await DocumentCategory.findAll({ where: { active: true }, order: [["name", "ASC"]] });
  res.render("request-new", {
    title: `New request | ${viewName}`,
    categories: categories.map((item) => item.get({ plain: true })),
    isStaff: Boolean(req.user),
    today: new Date().toISOString().slice(0, 10),
  });
});

export const createRequest = asyncHandler(async (req, res) => {
  await ensureDatabase();
  const request = await submitRequest(req.body);
  req.flash("request_reference", request.referenceNo);
  res.redirect("/requests/submitted");
});

export const requestSubmittedPage = (req, res) => {
  const requestReference = req.flash("request_reference")[0];
  if (!requestReference) return res.redirect("/requests/new");
  res.setHeader("Cache-Control", "private, no-store");
  res.render("request-submitted", {
    title: `Request submitted | ${viewName}`,
    requestReference,
  });
};

export const trackRequestPage = (req, res) => {
  res.render("track", {
    title: `Track a request | ${viewName}`,
    referenceNo: String(req.query.reference || ""),
  });
};

export const trackRequest = asyncHandler(async (req, res) => {
  await ensureDatabase();
  res.setHeader("Cache-Control", "private, no-store");
  const referenceNo = String(req.body.referenceNo || "").trim().toUpperCase();
  try {
    const request = await getTrackedRequest(referenceNo, req.body.contactInfo);
    res.render("track", {
      title: `Track a request | ${viewName}`,
      request,
      isTracked: true,
      referenceNo,
    });
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
    res.status(404).render("track", {
      title: `Track a request | ${viewName}`,
      referenceNo,
      trackingError: "We could not find a request matching those details. Check the reference number and contact phone, then try again.",
    });
  }
});

export const resubmitTrackedRequestController = asyncHandler(async (req, res) => {
  await ensureDatabase();
  res.setHeader("Cache-Control", "private, no-store");
  const request = await resubmitTrackedRequest(
    req.body.referenceNo,
    req.body.contactInfo,
    req.body,
  );
  res.render("track", {
    title: `Track a request | ${viewName}`,
    request,
    isTracked: true,
    referenceNo: request.referenceNo,
    successMessage: "Your corrections have been resubmitted for review.",
  });
});

export const requestDetailPage = asyncHandler(async (req, res) => {
  const request = await getRequestForUser(parseRequestId(req.params.id), req.user);
  const staff = ["staff", "admin"].includes(req.user.role);
  res.render("request-detail", {
    title: `${request.referenceNo} | ${viewName}`,
    request,
    isStaff: staff,
    isApplicant: !staff,
    allowedStatuses: staff ? requestAllowedStatuses(request).filter((status) => status !== "Submitted") : [],
    canResubmit: !staff && request.status === "Correction Requested",
  });
});

export const updateRequest = withUploadCleanup(async (req, res) => {
  const request = await getRequestForUser(parseRequestId(req.params.id), req.user);
  await updateRequestStatus(request, req.user, String(req.body.status || ""), req.body.remarks, req.file);
  req.flash("success_msg", `Request ${request.referenceNo} was updated.`);
  res.redirect(`/requests/${request.id}`);
});

const sendPrivateFile = async (req, res, next, filePath, downloadName) => {
  if (!filePath) throw new HttpError(404, "No file is attached to this request.");
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(`${privateUploadDirectory}${path.sep}`)) {
    throw new HttpError(404, "The requested file could not be found.");
  }
  try {
    await fs.promises.access(resolvedPath, fs.constants.R_OK);
  } catch (error) {
    if (error.code === "ENOENT") throw new HttpError(404, "The requested file could not be found.");
    throw error;
  }
  res.download(resolvedPath, downloadName, (error) => {
    if (!error) return;
    if (res.headersSent) return res.destroy(error);
    next(error);
  });
};

export const downloadResult = asyncHandler(async (req, res, next) => {
  const request = await getRequestForUser(parseRequestId(req.params.id), req.user);
  const record = request.record;
  res.setHeader("Cache-Control", "private, no-store");
  await sendPrivateFile(req, res, next, record?.resultPath, `${request.referenceNo}-released-document`);
});
