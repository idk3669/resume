"""Private career workspace models, password hashing and bounded public API readers."""
import hashlib
import hmac
import html
from html.parser import HTMLParser
import json
import math
import re
import secrets
import time
from typing import Literal
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

from pydantic import BaseModel, ConfigDict, Field, field_validator


def password_hash(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 600_000).hex()
    return f'pbkdf2_sha256$600000${salt}${digest}'


def password_matches(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt, expected = encoded.split('$')
        if algorithm != 'pbkdf2_sha256' or not 600_000 <= int(rounds) <= 2_000_000:
            return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), int(rounds)).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


class Model(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


class Location(Model):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Profile(Model):
    roles: list[str] = Field(default_factory=list, max_length=10)
    origin: str = Field(default='대한민국 서울특별시 신림역', max_length=200)
    coordinates: Location | None = None
    professional: str = Field(default='', max_length=30000)
    personal: str = Field(default='', max_length=30000)
    learning: str = Field(default='', max_length=30000)

    @field_validator('roles')
    @classmethod
    def known_roles(cls, values):
        if any(v not in ['클라우드', '플랫폼', 'DevOps', 'SRE', 'MLOps·AI 플랫폼'] for v in values):
            raise ValueError('지원하지 않는 직무입니다.')
        return list(dict.fromkeys(values))


class Job(Model):
    company: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(min_length=1, max_length=30000)
    url: str = Field(default='', max_length=2000)
    role: str = Field(default='미확인', max_length=50)
    region: str = Field(default='미확인', max_length=100)
    size: str = Field(default='미확인', max_length=50)
    mode: str = Field(default='미확인', max_length=50)
    address: str = Field(default='', max_length=500)
    coordinates: Location | None = None

    @field_validator('url')
    @classmethod
    def safe_url(cls, value):
        if value:
            parsed = urlsplit(value)
            if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError('http 또는 https 원문 URL만 저장할 수 있습니다.')
        return value


class Source(Model):
    provider: Literal['greenhouse', 'lever']
    slug: str = Field(pattern=r'^[a-zA-Z0-9_-]{1,80}$')
    company: str = Field(min_length=1, max_length=100)


class Login(Model):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)
    password: str = Field(min_length=1, max_length=256)


class Status(Model):
    status: Literal['new', 'saved', 'applied', 'excluded']


def distance_km(start, end):
    if not start or not end:
        return None
    lat1, lat2 = math.radians(start['lat']), math.radians(end['lat'])
    dlat = lat2 - lat1
    dlng = math.radians(end['lng'] - start['lng'])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return round(6371 * 2 * math.asin(math.sqrt(min(1, a))), 2)


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        if tag in ('p', 'li', 'br', 'div', 'h2', 'h3'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_text(value):
    parser = TextOnly()
    parser.feed(html.unescape(str(value)))
    return re.sub(r'\n\s*\n+', '\n\n', ''.join(parser.parts)).strip()[:30000]


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_json(url, headers=None):
    """No user URLs, redirects, cookies or proxy environment; HTTPS allowlist only."""
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in {
        'boards-api.greenhouse.io', 'api.lever.co', 'dapi.kakao.com'
    } or parsed.port not in (None, 443) or parsed.username:
        raise ValueError('허용되지 않은 수집 주소입니다.')
    from urllib.request import ProxyHandler
    opener = build_opener(ProxyHandler({}), NoRedirects())
    request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'PersonalCareerBoard/1.0', **(headers or {})})
    deadline = time.monotonic() + 15
    chunks, size = [], 0
    with opener.open(request, timeout=8) as response:
        while True:
            chunk = response.read(65536)
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
            if size > 8 * 1024 * 1024 or time.monotonic() > deadline:
                raise ValueError('외부 응답이 너무 크거나 느립니다.')
    return json.loads(b''.join(chunks))


def collect(source):
    provider, slug = source['provider'], source['slug']
    if provider == 'greenhouse':
        data = fetch_json(f'https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true')
        rows = data['jobs']
        if not isinstance(rows, list) or data.get('meta', {}).get('total', len(rows)) != len(rows):
            raise ValueError('불완전한 채용 목록입니다.')
    else:
        rows = []
        deadline = time.monotonic() + 40
        for page in range(20):
            if time.monotonic() > deadline:
                raise ValueError('전체 수집 시간 제한을 초과했습니다.')
            batch = fetch_json(f'https://api.lever.co/v0/postings/{slug}?mode=json&limit=100&skip={page * 100}')
            if not isinstance(batch, list):
                raise ValueError('잘못된 채용 목록입니다.')
            rows.extend(batch)
            if len(batch) < 100:
                break
        else:
            raise ValueError('수집 한도를 초과했습니다. 기존 공고는 유지합니다.')
    if not isinstance(rows, list) or len(rows) > 2000:
        raise ValueError('수집 한도를 초과했습니다.')
    jobs = []
    for item in rows:
        identifier = str(item['id'])
        if provider == 'greenhouse':
            title, address = item['title'], item.get('location', {}).get('name', '')
            text, url = plain_text(item.get('content', '')), item['absolute_url']
        else:
            title, address = item['text'], item.get('categories', {}).get('location', '')
            text = plain_text(item.get('descriptionPlain', '') + '\n' + '\n'.join(
                f"{part.get('text', '')}\n{part.get('content', '')}" for part in item.get('lists', [])
            ) + '\n' + item.get('additionalPlain', ''))
            url = item['hostedUrl']
        title_lower = title.lower()
        role = next((label for terms, label in [
            (('mlops', 'ai platform'), 'MLOps·AI 플랫폼'), (('devops',), 'DevOps'),
            (('sre', 'site reliability'), 'SRE'), (('platform', '플랫폼'), '플랫폼'),
            (('cloud', '클라우드'), '클라우드')
        ] if any(term in title_lower for term in terms)), '미확인')
        region = next((label for term, label in [('seoul', '서울'), ('서울', '서울'), ('경기', '경기'), ('인천', '인천')] if term in address.lower()), '미확인')
        job = Job(company=source['company'], title=title[:150], description=text or '본문 미제공: 원문에서 확인해 주세요.',
                  url=url, role=role, region=region, address=address[:500]).model_dump()
        # Hash external IDs to keep identifiers bounded and URL-safe.
        job['id'] = f"{provider}-{slug}-" + hashlib.sha256(identifier.encode()).hexdigest()[:24]
        jobs.append(job)
    if len({j['id'] for j in jobs}) != len(jobs):
        raise ValueError('중복된 외부 ID가 포함된 목록입니다. 기존 공고는 유지합니다.')
    return jobs


def search_places(query, key):
    data = fetch_json('https://dapi.kakao.com/v2/local/search/keyword.json?' + urlencode({'query': query, 'size': 5}),
                      {'Authorization': f'KakaoAK {key}'})
    return [{'name': x['place_name'], 'address': x.get('road_address_name') or x['address_name'],
             'coordinates': Location(lat=float(x['y']), lng=float(x['x'])).model_dump()} for x in data['documents']]
