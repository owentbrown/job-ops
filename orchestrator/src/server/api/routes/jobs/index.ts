import { Router } from "express";
import { jobsActionsRouter } from "./actions";
import { jobsApplicationRouter } from "./application";
import { jobsCoverLetterRouter } from "./cover-letter";
import { jobsDocumentsRouter } from "./documents";
import { jobsMaintenanceRouter } from "./maintenance";
import { jobsMutationsRouter } from "./mutations";
import { jobsNotesRouter } from "./notes";
import { jobsReadRouter } from "./read";
import { jobsStagesRouter } from "./stages";

export const jobsRouter = Router();

jobsRouter.use(jobsReadRouter);
jobsRouter.use(jobsActionsRouter);
jobsRouter.use(jobsNotesRouter);
jobsRouter.use(jobsStagesRouter);
jobsRouter.use(jobsDocumentsRouter);
jobsRouter.use(jobsCoverLetterRouter);
jobsRouter.use(jobsApplicationRouter);
jobsRouter.use(jobsMaintenanceRouter);
jobsRouter.use(jobsMutationsRouter);
