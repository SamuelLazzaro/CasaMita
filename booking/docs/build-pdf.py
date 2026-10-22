"""
build-pdf.py - renders a guide written in a small Markdown subset to PDF.

    python docs/build-pdf.py docs/guida-installazione-hotel.md

Supported: # ## ### headings, paragraphs, "- " bullets, "1. " numbered items,
fenced code blocks, pipe tables with a header row, **bold**, `code` and bare
URLs. Fonts: Arial (text) and Consolas (code) from the Windows font folder,
so every Unicode character of the Italian text renders correctly.
"""
import html
import re
import sys
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import ListFlowable, ListItem, PageBreak, Paragraph, Preformatted, SimpleDocTemplate, Spacer, Table, TableStyle

FONT_DIR = Path('C:/Windows/Fonts')
pdfmetrics.registerFont(TTFont('Body', FONT_DIR / 'arial.ttf'))
pdfmetrics.registerFont(TTFont('Body-Bold', FONT_DIR / 'arialbd.ttf'))
pdfmetrics.registerFont(TTFont('Mono', FONT_DIR / 'consola.ttf'))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Body-Bold', italic='Body', boldItalic='Body-Bold')

ACCENT = colors.HexColor('#1d4ed8')
MUTED = colors.HexColor('#6b655d')
CODE_BG = colors.HexColor('#f3f1ee')
BORDER = colors.HexColor('#d9d4cc')

STYLES = {
    'title': ParagraphStyle('title', fontName='Body-Bold', fontSize=22, leading=27, spaceAfter=6 * mm, textColor=ACCENT),
    'h2': ParagraphStyle('h2', fontName='Body-Bold', fontSize=15, leading=19, spaceBefore=7 * mm, spaceAfter=3 * mm, textColor=ACCENT),
    'h3': ParagraphStyle('h3', fontName='Body-Bold', fontSize=12, leading=15, spaceBefore=4 * mm, spaceAfter=2 * mm),
    'body': ParagraphStyle('body', fontName='Body', fontSize=10, leading=14, spaceAfter=2.5 * mm, alignment=TA_LEFT),
    'cell': ParagraphStyle('cell', fontName='Body', fontSize=9, leading=12),
    'cellhead': ParagraphStyle('cellhead', fontName='Body-Bold', fontSize=9, leading=12),
    'code': ParagraphStyle('code', fontName='Mono', fontSize=8.5, leading=11, backColor=CODE_BG, borderColor=BORDER, borderWidth=0.5, borderPadding=4, leftIndent=2, spaceBefore=1 * mm, spaceAfter=3.5 * mm),
    'meta': ParagraphStyle('meta', fontName='Body', fontSize=8, textColor=MUTED),
}


def inline(text: str) -> str:
    """Converts Markdown inline markup to reportlab paragraph markup.

    Args:
        text: one line of Markdown text.

    Returns:
        The text with bold, code and links as reportlab tags, HTML-escaped.
    """
    text = html.escape(text, quote=False)
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'`([^`]+)`', r'<font face="Mono" size="9">\1</font>', text)
    text = re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)', r'<link href="\2" color="#1d4ed8">\1</link>', text)
    return text


def table_flowable(rows: list[list[str]]) -> list[Any]:
    """Builds a table flowable from pipe-table rows (first row = header)."""
    header = [Paragraph(inline(cell), STYLES['cellhead']) for cell in rows[0]]
    body = [[Paragraph(inline(cell), STYLES['cell']) for cell in row] for row in rows[1:]]
    columns = len(rows[0])
    available = A4[0] - 40 * mm
    widths = [available * 0.32] + [available * 0.68 / (columns - 1)] * (columns - 1) if columns > 1 else [available]
    table = Table([header] + body, colWidths=widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), CODE_BG),
        ('LINEBELOW', (0, 0), (-1, 0), 0.8, BORDER),
        ('LINEBELOW', (0, 1), (-1, -1), 0.3, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return [table, Spacer(1, 3 * mm)]


def list_flowable(items: list[str], numbered: bool) -> list[Any]:
    """Builds a bulleted or numbered list flowable."""
    flowables = [ListItem(Paragraph(inline(item), STYLES['body']), leftIndent=12) for item in items]
    kind = '1' if numbered else 'bullet'
    return [ListFlowable(flowables, bulletType=kind, start='1' if numbered else None, leftIndent=14, bulletFontName='Body', bulletFontSize=10, spaceAfter=2 * mm)]


def parse(markdown: str) -> list[Any]:
    """Turns the Markdown subset into reportlab flowables.

    Args:
        markdown: the whole document.

    Returns:
        The story to hand to SimpleDocTemplate.build().
    """
    story: list[Any] = []
    lines = markdown.split('\n')
    index = 0
    paragraph: list[str] = []
    list_items: list[str] = []
    list_numbered = False

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            story.append(Paragraph(inline(' '.join(paragraph)), STYLES['body']))
            paragraph = []

    def flush_list() -> None:
        nonlocal list_items
        if list_items:
            story.extend(list_flowable(list_items, list_numbered))
            list_items = []

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if stripped.startswith('```'):
            flush_paragraph()
            flush_list()
            code: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith('```'):
                code.append(lines[index])
                index += 1
            story.append(Preformatted('\n'.join(code), STYLES['code']))
            index += 1
            continue
        if stripped.startswith('|'):
            flush_paragraph()
            flush_list()
            rows: list[list[str]] = []
            while index < len(lines) and lines[index].strip().startswith('|'):
                cells = [cell.strip() for cell in lines[index].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'-+', cell) for cell in cells):
                    rows.append(cells)
                index += 1
            story.extend(table_flowable(rows))
            continue
        heading = re.match(r'^(#{1,3})\s+(.*)$', stripped)
        if heading:
            flush_paragraph()
            flush_list()
            level = len(heading.group(1))
            style = {1: 'title', 2: 'h2', 3: 'h3'}[level]
            if level == 2 and story:
                story.append(Spacer(1, 1 * mm))
            story.append(Paragraph(inline(heading.group(2)), STYLES[style]))
            index += 1
            continue
        bullet = re.match(r'^- (.*)$', stripped)
        number = re.match(r'^\d+\. (.*)$', stripped)
        if bullet or number:
            flush_paragraph()
            numbered = number is not None
            if list_items and numbered != list_numbered:
                flush_list()
            list_numbered = numbered
            list_items.append((bullet or number).group(1))
            index += 1
            continue
        if stripped == '':
            flush_paragraph()
            flush_list()
            index += 1
            continue
        # Continuation line of a list item (indented) or of a paragraph.
        if list_items and line.startswith('  '):
            list_items[-1] += ' ' + stripped
        else:
            flush_list()
            paragraph.append(stripped)
        index += 1
    flush_paragraph()
    flush_list()
    return story


def page_decorations(canvas: Any, doc: Any) -> None:
    """Draws the running footer: document name and page number."""
    canvas.saveState()
    canvas.setFont('Body', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(20 * mm, 12 * mm, 'Modulo booking: guida all\'installazione')
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f'Pagina {doc.page}')
    canvas.restoreState()


def main() -> None:
    """Renders the Markdown file given as first argument next to itself, as PDF."""
    source = Path(sys.argv[1])
    output = source.with_suffix('.pdf')
    markdown = source.read_text(encoding='utf-8')
    doc = SimpleDocTemplate(str(output), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=20 * mm, title='Sistema di prenotazione: guida all\'installazione', author='Modulo booking')
    doc.build(parse(markdown), onFirstPage=page_decorations, onLaterPages=page_decorations)
    print(f'written {output}')


if __name__ == '__main__':
    main()
