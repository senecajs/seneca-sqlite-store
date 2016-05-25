FROM ubuntu:14.04
ADD . /home
RUN apt-get update && apt-get -y install sqlite3
CMD ["sqlite3", "-init", "/script/schema.sql", "/test/db/senecatest.db"]
EXPOSE 12345