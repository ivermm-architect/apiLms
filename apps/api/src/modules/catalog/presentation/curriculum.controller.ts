import { Controller, Get, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';

import { Public } from '../../auth/infrastructure/decorators/public.decorator';
import { CurriculumPdfService } from '../application/curriculum-pdf.service';

/**
 * Endpoint público que sirve la malla curricular como PDF descargable.
 * Ruta final (prefijo global + versión): GET /api/v1/catalog/plan-estudios.pdf
 */
@Controller('catalog')
export class CurriculumController {
  constructor(private readonly curriculumPdf: CurriculumPdfService) {}

  @Public()
  @Get('plan-estudios.pdf')
  async downloadCurriculum(@Res() reply: FastifyReply): Promise<void> {
    const pdf = await this.curriculumPdf.generate();
    // Documento dinámico: refleja la malla (BD) y el branding vigentes. No se
    // cachea para que cambios de plan/color se vean al instante, sin PDF rancio.
    await reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'inline; filename="plan-de-estudios-cieba.pdf"')
      .header('Cache-Control', 'no-store, must-revalidate')
      .send(pdf);
  }
}
