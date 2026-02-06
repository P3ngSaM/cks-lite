# -*- coding: utf-8 -*-
"""
CKS Lite Email Sender - 预构建邮件发送器
用法: python cks_email_sender.py <config.json>

config.json 格式:
{
    "smtp_server": "smtp.163.com",
    "smtp_port": 465,
    "email_addr": "user@163.com",
    "auth_code": "授权码",
    "to": "recipient@example.com",
    "subject": "邮件主题",
    "body": "正文内容（纯文本，会自动转为 HTML）",
    "html_body": "自定义 HTML（可选，优先于 body）",
    "attachments": ["C:\\path\\to\\file.pptx"],
    "cc": "cc@example.com",
    "bcc": "bcc@example.com"
}
"""

import json
import sys
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

# MIME 类型映射
MIME_MAP = {
    ".pptx": ("application", "vnd.openxmlformats-officedocument.presentationml.presentation"),
    ".xlsx": ("application", "vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ".docx": ("application", "vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".pdf": ("application", "pdf"),
    ".zip": ("application", "zip"),
    ".rar": ("application", "x-rar-compressed"),
    ".png": ("image", "png"),
    ".jpg": ("image", "jpeg"),
    ".jpeg": ("image", "jpeg"),
    ".gif": ("image", "gif"),
    ".txt": ("text", "plain"),
    ".csv": ("text", "csv"),
    ".html": ("text", "html"),
    ".mp4": ("video", "mp4"),
    ".mp3": ("audio", "mpeg"),
}


def text_to_html(text):
    """将纯文本转为 HTML"""
    # 将换行转为 <br>
    paragraphs = text.split("\n\n")
    html_parts = []
    for p in paragraphs:
        lines = p.strip().split("\n")
        html_parts.append("<p>" + "<br>".join(lines) + "</p>")

    html = '<div style="font-family:Microsoft YaHei,Arial,sans-serif;padding:20px;max-width:800px;margin:0 auto;">'
    html += "".join(html_parts)
    html += '<hr style="border:none;border-top:1px solid #eee;margin:20px 0;">'
    html += '<p style="color:#999;font-size:12px;">由 CKS Lite 智能助手发送</p>'
    html += '</div>'
    return html


def send_email(config):
    """发送邮件"""
    smtp_server = config["smtp_server"]
    smtp_port = config.get("smtp_port", 465)
    email_addr = config["email_addr"]
    auth_code = config["auth_code"]
    to_addr = config["to"]
    subject = config.get("subject", "（无主题）")
    body = config.get("body", "")
    html_body = config.get("html_body", "")
    attachments = config.get("attachments", [])
    cc = config.get("cc", "")
    bcc = config.get("bcc", "")

    # 构建邮件
    msg = MIMEMultipart()
    msg["From"] = email_addr
    msg["To"] = to_addr
    msg["Subject"] = subject

    if cc:
        msg["Cc"] = cc

    # 正文（优先使用 html_body）
    if html_body:
        msg.attach(MIMEText(html_body, "html", "utf-8"))
    elif body:
        msg.attach(MIMEText(text_to_html(body), "html", "utf-8"))
    else:
        msg.attach(MIMEText(text_to_html("此邮件由 CKS Lite 助手发送。"), "html", "utf-8"))

    # 附件
    for file_path in attachments:
        if not os.path.exists(file_path):
            print(f"WARNING: 附件不存在: {file_path}")
            continue

        file_name = os.path.basename(file_path)
        ext = os.path.splitext(file_name)[1].lower()
        maintype, subtype = MIME_MAP.get(ext, ("application", "octet-stream"))

        try:
            with open(file_path, "rb") as f:
                att = MIMEBase(maintype, subtype)
                att.set_payload(f.read())
            encoders.encode_base64(att)
            att.add_header("Content-Disposition", "attachment",
                           filename=("utf-8", "", file_name))
            msg.attach(att)
            print(f"附件已添加: {file_name} ({maintype}/{subtype})")
        except Exception as e:
            print(f"WARNING: 添加附件失败 {file_name}: {e}")

    # 收件人列表
    recipients = [to_addr]
    if cc:
        recipients.extend([a.strip() for a in cc.split(",") if a.strip()])
    if bcc:
        recipients.extend([a.strip() for a in bcc.split(",") if a.strip()])

    # 发送
    try:
        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(email_addr, auth_code)
            server.send_message(msg, to_addrs=recipients)
        print(f"发送成功!")
        print(f"收件人: {to_addr}")
        if cc:
            print(f"抄送: {cc}")
        print(f"主题: {subject}")
        if attachments:
            print(f"附件数: {len(attachments)}")
    except smtplib.SMTPAuthenticationError:
        print("ERROR: 邮箱认证失败，请检查邮箱地址和授权码是否正确")
        sys.exit(1)
    except smtplib.SMTPRecipientsRefused:
        print(f"ERROR: 收件人地址被拒绝: {to_addr}")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: 发送失败: {e}")
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python cks_email_sender.py <config.json>")
        sys.exit(1)

    config_path = sys.argv[1]
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        print(f"ERROR: 读取配置文件失败: {e}")
        sys.exit(1)

    # 验证必填字段
    required = ["smtp_server", "email_addr", "auth_code", "to"]
    missing = [f for f in required if f not in config]
    if missing:
        print(f"ERROR: 缺少必填字段: {', '.join(missing)}")
        sys.exit(1)

    send_email(config)
