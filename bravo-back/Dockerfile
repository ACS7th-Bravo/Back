# Python slim 베이스 이미지 사용 (용량이 작으므로 Python base image가 Selenium 베이스 이미지보다 일반적으로 더 작음)
FROM python:3.9-slim

# 시스템 패키지 업데이트 및 필요한 패키지 설치
RUN apt-get update && apt-get install -y \
    cron \
    wget \
    gnupg \
    unzip \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Google Chrome 설치 (Selenium 실행용)
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y google-chrome-stable && \
    rm -rf /var/lib/apt/lists/*

# ChromeDriver 설치 (Chrome 버전에 맞게 버전 조정 필요)
ENV CHROMEDRIVER_VERSION 91.0.4472.19
RUN wget -q "https://chromedriver.storage.googleapis.com/${CHROMEDRIVER_VERSION}/chromedriver_linux64.zip" -O /tmp/chromedriver.zip && \
    unzip /tmp/chromedriver.zip -d /usr/local/bin/ && \
    rm /tmp/chromedriver.zip && \
    chmod +x /usr/local/bin/chromedriver

# 작업 디렉토리 설정
WORKDIR /app

# Python 의존성 파일 복사 및 설치
# requirements.txt에는 selenium, pymongo, redis 등 필요한 패키지를 명시합니다.
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사 (crawler.py 등)
COPY . /app

# crontab 파일 복사
# 예시 crontab 내용 (파일명: crawler-cron)
# -------------------------------------------------
# # 매일 정오에 crawler.py 실행 (당일 날짜 - 2 계산 및 CSV 다운로드 등 로직은 crawler.py 내에서 구현)
0 12 * * * cd /app && python dail-top200-chart-crawler.py >> /var/log/cron.log 2>&1
# -------------------------------------------------
COPY crawler-cron /etc/cron.d/crawler-cron

# crontab 파일 권한 설정 및 등록
RUN chmod 0644 /etc/cron.d/crawler-cron && crontab /etc/cron.d/crawler-cron

# cron 로그 파일 생성 (tail 명령어를 통해 로그 확인)
RUN touch /var/log/cron.log

# 컨테이너 시작 시 cron 데몬 실행 및 로그 출력
CMD ["sh", "-c", "cron && tail -f /var/log/cron.log"]