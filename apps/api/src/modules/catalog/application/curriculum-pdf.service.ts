import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import PDFDocument from 'pdfkit';

import { DATABASE } from '../../../core/database/database.module';

interface CourseRow {
  id: string;
  title: string;
  subtitle: string | null;
  level: string;
  academicYear: number;
  durationMinutes: number;
  totalLessons: number;
}
interface SectionRow {
  courseId: string;
  title: string;
  position: number;
}

/** Paleta efectiva del documento, derivada del branding persistido en BD. */
interface Palette {
  primary: string;
  secondary: string;
  onBrand: string;
  platformName: string;
}

/**
 * Genera el PDF de la malla curricular (plan de estudios) leyendo la BD:
 * cursos publicados agrupados por año académico, con sus unidades (secciones).
 * Documento formal descargable por el público externo desde la landing.
 *
 * Los colores de marca NO están hardcodeados: se derivan del branding
 * configurable (tabla system_config → branding.primaryColor/secondaryColor),
 * la misma fuente que consume el front. Cambiar la paleta en admin cambia el PDF.
 */
@Injectable()
export class CurriculumPdfService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private static readonly CONFIG_KEY = 'system_config';
  private static readonly DEFAULT_PRIMARY = '#7c3aed';
  private static readonly DEFAULT_SECONDARY = '#6366f1';

  // Neutros de tema (no branding): equivalen a --fg-* del DS, fijos por diseño.
  private static readonly FG = '#111827';
  private static readonly MUTED = '#6b7280';
  private static readonly HAIRLINE = '#e5e7eb';

  private static readonly YEAR_LABELS: Record<number, string> = {
    1: 'Primer año',
    2: 'Segundo año',
  };

  private static readonly YEAR_WORDS: Record<number, string> = {
    1: 'un',
    2: 'dos',
    3: 'tres',
  };

  private static readonly LEVEL_LABELS: Record<string, string> = {
    beginner: 'Básico',
    intermediate: 'Intermedio',
    advanced: 'Avanzado',
  };

  async generate(): Promise<Buffer> {
    const palette = await this.resolvePalette();

    // Selección explícita de columnas (no select-all) para no acoplar el PDF a
    // columnas del schema que aún no estén migradas en la BD (p.ej. curriculum_id).
    const courses = await this.db
      .select({
        id: schema.courses.id,
        title: schema.courses.title,
        subtitle: schema.courses.subtitle,
        level: schema.courses.level,
        academicYear: schema.courses.academicYear,
        durationMinutes: schema.courses.durationMinutes,
        totalLessons: schema.courses.totalLessons,
      })
      .from(schema.courses)
      .where(eq(schema.courses.status, 'published'))
      .orderBy(asc(schema.courses.academicYear), asc(schema.courses.title));

    const sections = await this.db
      .select({
        courseId: schema.sections.courseId,
        title: schema.sections.title,
        position: schema.sections.position,
      })
      .from(schema.sections)
      .orderBy(asc(schema.sections.position));

    // Secciones por curso (ya vienen ordenadas por posición).
    const sectionsByCourse = new Map<string, typeof sections>();
    for (const s of sections) {
      const arr = sectionsByCourse.get(s.courseId) ?? [];
      arr.push(s);
      sectionsByCourse.set(s.courseId, arr);
    }

    // Cursos agrupados por año académico, en orden 1 → 2.
    const byYear = new Map<number, typeof courses>();
    for (const c of courses) {
      const arr = byYear.get(c.academicYear) ?? [];
      arr.push(c);
      byYear.set(c.academicYear, arr);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);

    return this.render(byYear, years, sectionsByCourse, courses.length, palette);
  }

  /**
   * Lee el branding persistido (system_config) y arma la paleta efectiva.
   * Resiliente: si no hay config o el valor es inválido, usa los defaults.
   */
  private async resolvePalette(): Promise<Palette> {
    let primary = CurriculumPdfService.DEFAULT_PRIMARY;
    let secondary = CurriculumPdfService.DEFAULT_SECONDARY;
    let platformName = 'CIEBA';

    try {
      const [row] = await this.db
        .select({ value: schema.systemConfig.value })
        .from(schema.systemConfig)
        .where(eq(schema.systemConfig.key, CurriculumPdfService.CONFIG_KEY))
        .limit(1);
      const branding = (row?.value as { branding?: Record<string, string> } | undefined)?.branding;
      if (branding?.primaryColor && this.isHex(branding.primaryColor))
        primary = branding.primaryColor;
      if (branding?.secondaryColor && this.isHex(branding.secondaryColor))
        secondary = branding.secondaryColor;
      if (branding?.platformName) platformName = branding.platformName;
    } catch {
      /* sin config o BD sin la tabla: se usan los defaults */
    }

    return { primary, secondary, onBrand: this.readableForeground(primary), platformName };
  }

  private isHex(hex: string): boolean {
    return /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(hex);
  }

  /**
   * Color de texto legible sobre un fondo dado. Portado de web `branding.ts`
   * (luminancia relativa WCAG) para mantener consistencia con el front.
   */
  private readableForeground(hex: string): string {
    const raw = hex.replace('#', '');
    const full =
      raw.length === 3
        ? raw
            .split('')
            .map((c) => c + c)
            .join('')
        : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return '#ffffff';
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return luminance > 0.45 ? '#07070b' : '#ffffff';
  }

  private render(
    byYear: Map<number, CourseRow[]>,
    years: number[],
    sectionsByCourse: Map<string, SectionRow[]>,
    totalCourses: number,
    palette: Palette,
  ): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: 56, bottom: 64, left: 56, right: 56 },
      info: {
        Title: 'Plan de Estudios — CIEBA',
        Author: palette.platformName,
        Subject: 'Malla curricular — Auxiliar en Enfermería',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    this.renderCover(doc, palette, years.length, totalCourses, contentWidth, left);
    doc.addPage();

    /* ── Contenido por año ── */
    for (const year of years) {
      const cursos = byYear.get(year) ?? [];
      this.ensureSpace(doc, 120);
      this.renderYearBand(
        doc,
        CurriculumPdfService.YEAR_LABELS[year] ?? `Año ${year}`,
        `${cursos.length} ${cursos.length === 1 ? 'materia' : 'materias'}`,
        palette,
        contentWidth,
        left,
      );

      for (const curso of cursos) {
        this.renderCourse(
          doc,
          curso,
          sectionsByCourse.get(curso.id) ?? [],
          palette,
          contentWidth,
          left,
        );
      }
      doc.moveDown(0.6);
    }

    this.renderFooters(doc, palette, contentWidth);

    doc.end();
    return done;
  }

  /* ── Portada ───────────────────────────────────────────── */

  private renderCover(
    doc: PDFKit.PDFDocument,
    palette: Palette,
    yearsCount: number,
    totalCourses: number,
    contentWidth: number,
    left: number,
  ): void {
    const { FG, MUTED } = CurriculumPdfService;

    // Wordmark: logo + nombre de plataforma.
    const logoSize = 34;
    const logoTop = doc.y;
    this.drawLogo(doc, left, logoTop, logoSize, palette);
    doc
      .fillColor(FG)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(palette.platformName, left + logoSize + 12, logoTop + 2);
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text('Instituto de formación técnica', left + logoSize + 12, logoTop + 20);

    // Bloque de título — protagonista, centrado en el tercio superior-medio.
    doc.y = doc.page.height * 0.34;
    doc
      .fillColor(palette.primary)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text('DOCUMENTO OFICIAL', { characterSpacing: 3 });
    doc.moveDown(0.6);
    doc.fillColor(FG).font('Helvetica-Bold').fontSize(46).text('Plan de Estudios', { lineGap: 2 });
    doc.moveDown(0.5);
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(15)
      .text('Carrera de Auxiliar en Enfermería', { paragraphGap: 3 });
    const yearsWord = CurriculumPdfService.YEAR_WORDS[yearsCount] ?? String(yearsCount);
    doc
      .fillColor(MUTED)
      .fontSize(12)
      .text(`Formación integral de ${yearsWord} ${yearsCount === 1 ? 'año' : 'años'}`);

    doc.moveDown(1.2);
    doc
      .strokeColor(palette.primary)
      .lineWidth(4)
      .moveTo(left, doc.y)
      .lineTo(left + 88, doc.y)
      .stroke();

    // Ficha de metadatos: fluye tras la línea con aire generoso (sin pegarse al pie).
    doc.moveDown(2.4);
    const rows: Array<[string, string]> = [
      ['Programa', 'Auxiliar en Enfermería'],
      [
        'Estructura',
        `${yearsCount} ${yearsCount === 1 ? 'año' : 'años'} · ${totalCourses} materias`,
      ],
      [
        'Emisión',
        new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' }),
      ],
    ];
    let ry = doc.y;
    for (const [k, v] of rows) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(k.toUpperCase(), left, ry, {
        characterSpacing: 1.5,
        width: 130,
      });
      doc
        .fillColor(FG)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(v, left + 140, ry, {
          width: contentWidth - 140,
        });
      ry += 28;
    }
  }

  /* ── Banda de año ──────────────────────────────────────── */

  private renderYearBand(
    doc: PDFKit.PDFDocument,
    label: string,
    subtitle: string,
    palette: Palette,
    contentWidth: number,
    left: number,
  ): void {
    const h = 30;
    const y = doc.y;
    const grad = doc.linearGradient(left, y, left + contentWidth, y + h);
    grad.stop(0, palette.secondary).stop(1, palette.primary);
    doc.roundedRect(left, y, contentWidth, h, 8).fill(grad);

    doc
      .fillColor(palette.onBrand)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(label, left + 14, y + 8, { lineBreak: false });
    doc
      .fillColor(palette.onBrand)
      .font('Helvetica')
      .fontSize(9.5)
      .text(subtitle, left, y + 10.5, { width: contentWidth - 14, align: 'right' });

    doc.y = y + h + 12;
    doc.x = left;
  }

  /* ── Tarjeta de materia ────────────────────────────────── */

  private renderCourse(
    doc: PDFKit.PDFDocument,
    curso: CourseRow,
    secs: SectionRow[],
    palette: Palette,
    contentWidth: number,
    left: number,
  ): void {
    const { FG, MUTED } = CurriculumPdfService;
    this.ensureSpace(doc, 78);

    const startY = doc.y;
    const barX = left;
    const textX = left + 14;
    const textW = contentWidth - 14;

    // Título + subtítulo.
    doc.fillColor(FG).font('Helvetica-Bold').fontSize(12.5).text(curso.title, textX, doc.y, {
      width: textW,
    });
    if (curso.subtitle) {
      doc
        .fillColor(MUTED)
        .font('Helvetica-Oblique')
        .fontSize(9)
        .text(curso.subtitle, textX, doc.y, { width: textW });
    }

    // Chips de meta: nivel · duración · nº de clases.
    const chips: string[] = [];
    const level = CurriculumPdfService.LEVEL_LABELS[curso.level];
    if (level) chips.push(level);
    if (curso.durationMinutes > 0) chips.push(`${Math.round(curso.durationMinutes / 60)} h`);
    if (curso.totalLessons > 0) chips.push(`${curso.totalLessons} clases`);
    if (chips.length > 0) {
      doc.moveDown(0.35);
      this.drawChips(doc, chips, textX, palette);
    }

    // Unidades (secciones) con viñeta de acento.
    if (secs.length > 0) {
      doc.moveDown(0.3);
      for (const sec of secs) {
        this.ensureSpace(doc, 15);
        const by = doc.y;
        doc
          .fillColor(palette.primary)
          .font('Helvetica')
          .fontSize(9.5)
          .text('•  ', textX, by, { continued: true })
          .fillColor(MUTED)
          .text(sec.title, { width: textW - 4 });
      }
    }

    // Barra de acento a la izquierda, dibujada tras conocer la altura final.
    const endY = doc.y;
    doc.roundedRect(barX, startY + 1, 3, Math.max(endY - startY - 2, 8), 1.5).fill(palette.primary);

    doc.moveDown(0.7);
    doc.x = left;
  }

  /** Dibuja una fila de chips (píldoras) con tint del color de marca. */
  private drawChips(doc: PDFKit.PDFDocument, chips: string[], x: number, palette: Palette): void {
    const y = doc.y;
    const padX = 7;
    const h = 15;
    let cx = x;
    doc.font('Helvetica-Bold').fontSize(8);
    for (const chip of chips) {
      const w = doc.widthOfString(chip) + padX * 2;
      doc.save();
      doc.roundedRect(cx, y, w, h, 7).fillColor(palette.primary).fillOpacity(0.1).fill();
      doc.restore();
      doc
        .fillColor(palette.primary)
        .fillOpacity(1)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(chip, cx + padX, y + 4, { lineBreak: false });
      cx += w + 6;
    }
    doc.y = y + h;
    doc.x = x;
  }

  /* ── Logo vectorial (birrete en cuadro con gradiente de marca) ── */

  private drawLogo(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    size: number,
    palette: Palette,
  ): void {
    // Cuadro redondeado con el gradiente signature (secondary → primary).
    const grad = doc.linearGradient(x, y, x + size, y + size);
    grad.stop(0, palette.secondary).stop(1, palette.primary);
    doc.roundedRect(x, y, size, size, size * 0.24).fill(grad);

    // Birrete (mortarboard) blanco, centrado.
    const cx = x + size / 2;
    const cy = y + size / 2;
    const k = size / 34;
    const white = palette.onBrand;

    doc.save();
    // Tablero (rombo).
    doc
      .moveTo(cx, cy - 7 * k)
      .lineTo(cx + 11 * k, cy - 2.5 * k)
      .lineTo(cx, cy + 2 * k)
      .lineTo(cx - 11 * k, cy - 2.5 * k)
      .closePath()
      .fill(white);
    // Base / cabeza (trapecio bajo el tablero).
    doc
      .moveTo(cx - 6 * k, cy - 0.5 * k)
      .lineTo(cx + 6 * k, cy - 0.5 * k)
      .lineTo(cx + 5 * k, cy + 6 * k)
      .lineTo(cx - 5 * k, cy + 6 * k)
      .closePath()
      .fill(white);
    // Borla: cae desde el borde derecho del tablero.
    doc
      .lineWidth(1.1 * k)
      .strokeColor(white)
      .moveTo(cx + 11 * k, cy - 2.5 * k)
      .lineTo(cx + 11 * k, cy + 5 * k)
      .stroke();
    doc.circle(cx + 11 * k, cy + 6 * k, 1.6 * k).fill(white);
    doc.restore();
  }

  /* ── Pie de página con paginación ──────────────────────── */

  private renderFooters(doc: PDFKit.PDFDocument, palette: Palette, contentWidth: number): void {
    const { MUTED, HAIRLINE } = CurriculumPdfService;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const left = doc.page.margins.left;
      const y = doc.page.height - doc.page.margins.bottom + 24;

      doc
        .strokeColor(HAIRLINE)
        .lineWidth(0.5)
        .moveTo(left, y - 6)
        .lineTo(left + contentWidth, y - 6)
        .stroke();

      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(`${palette.platformName} · Plan de Estudios`, left, y, { lineBreak: false });
      const pageLabel = `Página ${i - range.start + 1} de ${range.count}`;
      const labelW = doc.widthOfString(pageLabel);
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(pageLabel, left + contentWidth - labelW, y, { lineBreak: false });
    }
  }

  /** Si queda menos de `needed` px hasta el margen inferior, salta de página. */
  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
    const bottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + needed > bottom) doc.addPage();
  }
}
