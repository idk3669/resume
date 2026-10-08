"""Extract text in a disposable subprocess, never execute or store uploaded documents."""
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

MAX_BYTES = 10 * 1024 * 1024
MAX_TEXT = 30000


def extract(data, extension):
    if len(data) > MAX_BYTES:
        raise ValueError('10MB 이하 파일만 업로드할 수 있습니다.')
    if extension == '.txt':
        text = data.decode('utf-8-sig')
    elif extension == '.docx':
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(x.file_size for x in entries) > 40 * 1024 * 1024:
                raise ValueError('압축 해제 크기 제한을 초과했습니다.')
            raw = archive.read('word/document.xml')
            if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
                raise ValueError('지원하지 않는 XML 형식입니다.')
            root = ET.fromstring(raw)
            ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
            text = '\n'.join(''.join(p.itertext()) for p in root.iter(ns + 'p'))
    elif extension == '.pdf':
        from pypdf import PdfReader
        if not data.startswith(b'%PDF-'):
            raise ValueError('PDF 파일 형식이 아닙니다.')
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise ValueError('암호를 해제한 PDF를 올려 주세요.')
        if len(reader.pages) > 80:
            raise ValueError('80페이지 이하 PDF만 지원합니다.')
        parts, count = [], 0
        for page in reader.pages:
            part = page.extract_text() or ''
            count += len(part)
            if count > MAX_TEXT:
                raise ValueError('본문이 30,000자를 초과합니다. 필요한 경력 부분만 올려 주세요.')
            parts.append(part)
        text = '\n'.join(parts)
    else:
        raise ValueError('PDF, DOCX, UTF-8 TXT만 지원합니다.')
    text = text.strip().replace('\x00', '')
    if not text:
        raise ValueError('텍스트를 찾지 못했습니다. 스캔 PDF는 OCR 후 올리거나 본문을 붙여 넣어 주세요.')
    if len(text) > MAX_TEXT:
        raise ValueError('본문은 30,000자 이하여야 합니다.')
    return text


if __name__ == '__main__':
    # Container memory limits protect the parent; Linux resource limits bound the parser.
    if sys.platform == 'linux':
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
    try:
        print(json.dumps({'text': extract(sys.stdin.buffer.read(MAX_BYTES + 1), sys.argv[1])}, ensure_ascii=True))
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else '파일을 읽을 수 없습니다. 손상 여부와 형식을 확인해 주세요.'
        print(json.dumps({'error': message}, ensure_ascii=True))
        sys.exit(1)
