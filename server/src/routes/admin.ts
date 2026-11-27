import { Router } from 'express'
import { requirePerm } from '../auth.ts'

export const adminRouter = Router()

adminRouter.use(requirePerm('dashboard'))
