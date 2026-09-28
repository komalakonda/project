"""
report_generator.py - Generates professional PDF accident reports using ReportLab
"""
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                 TableStyle, HRFlowable)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPORTS_DIR = os.path.join(BASE_DIR, '..', 'reports')


def generate_accident_report(accident: dict) -> str:
    os.makedirs(REPORTS_DIR, exist_ok=True)
    acc_id = accident.get('id', 'unknown')
    ts = accident.get('timestamp', datetime.utcnow().isoformat())
    filename = f"accident_report_{acc_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.pdf"
    filepath = os.path.join(REPORTS_DIR, filename)

    doc = SimpleDocTemplate(filepath, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    story = []

    # --- Header ---
    title_style = ParagraphStyle('Title', parent=styles['Title'],
                                  fontSize=20, textColor=colors.HexColor('#1a1a2e'),
                                  spaceAfter=4)
    sub_style = ParagraphStyle('Sub', parent=styles['Normal'],
                                fontSize=10, textColor=colors.HexColor('#555555'),
                                alignment=TA_CENTER)
    body_style = ParagraphStyle('Body', parent=styles['Normal'],
                                 fontSize=10, leading=16)
    section_style = ParagraphStyle('Section', parent=styles['Heading2'],
                                    fontSize=13, textColor=colors.HexColor('#16213e'),
                                    spaceBefore=12, spaceAfter=6)

    story.append(Paragraph("🚗 AI-Powered Car Black Box System", title_style))
    story.append(Paragraph("Accident Analysis Report", sub_style))
    story.append(Spacer(1, 0.3*cm))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#e94560')))
    story.append(Spacer(1, 0.5*cm))

    # Meta info
    meta_data = [
        ['Report ID', f"#{acc_id}"],
        ['Generated At', datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')],
        ['Incident Time', str(ts)],
        ['Location', f"Lat: {accident.get('gps_lat', 'N/A')}, Lon: {accident.get('gps_lon', 'N/A')}"],
    ]
    meta_table = Table(meta_data, colWidths=[4.5*cm, 12*cm])
    meta_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#555555')),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.HexColor('#f8f9fa'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 0.5*cm))

    # Severity badge
    severity = accident.get('severity', 'Unknown')
    sev_colors = {'Minor': '#27ae60', 'Moderate': '#f39c12',
                  'Severe': '#e67e22', 'Critical': '#e74c3c'}
    sev_color = sev_colors.get(severity, '#888888')
    sev_style = ParagraphStyle('Sev', fontSize=16, textColor=colors.HexColor(sev_color),
                                alignment=TA_CENTER, fontName='Helvetica-Bold')
    story.append(Paragraph(f"Accident Severity: {severity.upper()}", sev_style))
    story.append(Spacer(1, 0.4*cm))

    # --- Sensor Readings ---
    story.append(Paragraph("Sensor Readings at Time of Incident", section_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd')))
    story.append(Spacer(1, 0.2*cm))

    sensor_data = [
        ['Sensor', 'Value', 'Sensor', 'Value'],
        ['Speed', f"{accident.get('speed', 0):.1f} km/h",
         'Alcohol Level (BAC)', f"{accident.get('alcohol_level', 0):.4f}"],
        ['Accel X (g)', f"{accident.get('accel_x', 0):.4f}",
         'Drowsiness Score', f"{accident.get('drowsiness_score', 0):.4f}"],
        ['Accel Y (g)', f"{accident.get('accel_y', 0):.4f}",
         'Obstacle Distance', f"{accident.get('obstacle_distance', 0):.2f} m"],
        ['Accel Z (g)', f"{accident.get('accel_z', 0):.4f}",
         'Impact Force', f"{accident.get('impact_force', 0):.4f} g"],
        ['SOS Triggered', '✓ YES' if accident.get('sos_triggered') else '✗ NO',
         'Accident Probability', f"{accident.get('accident_probability', 0)*100:.1f}%"],
    ]
    sensor_table = Table(sensor_data, colWidths=[4.5*cm, 4.5*cm, 4.5*cm, 4.5*cm])
    sensor_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#16213e')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f0f4ff'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('PADDING', (0, 0), (-1, -1), 7),
        ('ALIGN', (1, 0), (1, -1), 'CENTER'),
        ('ALIGN', (3, 0), (3, -1), 'CENTER'),
    ]))
    story.append(sensor_table)
    story.append(Spacer(1, 0.5*cm))

    # --- AI Analysis ---
    story.append(Paragraph("AI Analysis & Findings", section_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd')))
    story.append(Spacer(1, 0.2*cm))

    ai_text = accident.get('ai_analysis', 'No analysis available.')
    for line in ai_text.split('\n'):
        if line.strip():
            story.append(Paragraph(line, body_style))

    story.append(Spacer(1, 0.4*cm))

    # Cause & Risk
    story.append(Paragraph("Cause & Risk Assessment", section_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd')))
    story.append(Spacer(1, 0.2*cm))

    risk_data = [
        ['Possible Cause', accident.get('possible_cause', 'Unknown')],
        ['Driver Risk Score', f"{accident.get('driver_risk_score', 0):.1f} / 100"],
        ['Emergency Alerted', 'Yes' if accident.get('emergency_alerted') else 'No'],
    ]
    risk_table = Table(risk_data, colWidths=[5*cm, 12*cm])
    risk_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.HexColor('#fff8f0'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
        ('PADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(risk_table)
    story.append(Spacer(1, 0.6*cm))

    # --- Recommendations ---
    story.append(Paragraph("Safety Recommendations", section_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd')))
    story.append(Spacer(1, 0.2*cm))

    recs = _get_recommendations(accident)
    for rec in recs:
        story.append(Paragraph(f"• {rec}", body_style))
    story.append(Spacer(1, 0.5*cm))

    # Footer
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#dddddd')))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'],
                                   fontSize=8, textColor=colors.grey, alignment=TA_CENTER)
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "⚠ This is a software simulation of an IoT car black box, not a certified real-world vehicle safety system.",
        footer_style))
    story.append(Paragraph(
        f"Generated by AI-Powered Car Black Box System | {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}",
        footer_style))

    doc.build(story)
    return filepath


def _get_recommendations(accident):
    recs = []
    if accident.get('alcohol_level', 0) > 0.08:
        recs.append("Immediate sobriety testing required. Driver should not operate the vehicle.")
    if accident.get('drowsiness_score', 0) > 0.6:
        recs.append("Driver shows signs of severe fatigue. Rest is mandatory before driving.")
    if accident.get('speed', 0) > 100:
        recs.append("Speed was above safe limits. Adhere to posted speed limits at all times.")
    if accident.get('obstacle_distance', 100) < 10:
        recs.append("Insufficient following distance detected. Maintain at least 30m gap.")
    if accident.get('impact_force', 0) > 10:
        recs.append("Vehicle should undergo structural inspection before next use.")
    if accident.get('sos_triggered'):
        recs.append("Emergency services have been notified. Await their arrival.")
    if accident.get('driver_risk_score', 0) > 70:
        recs.append("High driver risk profile detected. Driver assessment program recommended.")
    if not recs:
        recs.append("Continue safe driving practices and maintain regular vehicle maintenance.")
    return recs
