#!/bin/bash
set -e
mkdir -p /etc/postgresql/16/main/conf.d
echo "listen_addresses = '*'" > /etc/postgresql/16/main/conf.d/listen.conf
echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/16/main/pg_hba.conf
echo "host all all ::0/0 md5" >> /etc/postgresql/16/main/pg_hba.conf
service postgresql restart
su - postgres -c "psql -c \"ALTER USER meridian WITH PASSWORD 'meridian';\""
