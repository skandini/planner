#!/bin/bash
# Скрипт для настройки Celery worker через systemd

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"

# Проверяем, что виртуальное окружение существует
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "❌ Virtual environment not found: $BACKEND_DIR/.venv"
    echo "Please create virtual environment first:"
    echo "  cd $BACKEND_DIR"
    echo "  python3.12 -m venv .venv"
    exit 1
fi

# Проверяем, что Celery установлен
if [ ! -f "$BACKEND_DIR/.venv/bin/celery" ]; then
    echo "❌ Celery not found. Installing dependencies..."
    source "$BACKEND_DIR/.venv/bin/activate"
    pip install -r "$BACKEND_DIR/requirements.txt"
fi

# Создаем systemd service файл
SERVICE_FILE="/etc/systemd/system/planner-celery-worker.service"
echo "Creating systemd service: $SERVICE_FILE"

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Planner Celery Worker
After=network.target redis-server.service
Requires=redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$BACKEND_DIR/.venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=$BACKEND_DIR/.venv/bin/celery -A app.celery_app worker --loglevel=info --concurrency=4
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=planner-celery-worker

# Ограничения ресурсов
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Перезагружаем systemd
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

# Включаем и запускаем сервис
echo "Enabling Celery worker service..."
sudo systemctl enable planner-celery-worker

echo "Starting Celery worker service..."
sudo systemctl start planner-celery-worker

# Показываем статус
echo ""
echo "✅ Celery worker service configured successfully!"
echo ""
echo "Status:"
sudo systemctl status planner-celery-worker --no-pager -l
echo ""
echo "To view logs:"
echo "  sudo journalctl -u planner-celery-worker -f"
echo ""
echo "To restart:"
echo "  sudo systemctl restart planner-celery-worker"

