#!/bin/bash
cd "$(dirname "$0")"
python3 update_version.py
echo
read -p "Enter キーで閉じます"
