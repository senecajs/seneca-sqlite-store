/*
 * in this directory execute:
 * sqlite3 -init ./schema.sql ../test/db/senecatest.db
 */

CREATE TABLE foo (
  id VARCHAR(36),
  p1 VARCHAR(255),
  p2 VARCHAR(255),
  p3 VARCHAR(255),
  seneca VARCHAR(125)
);

CREATE TABLE moon_bar (
  id VARCHAR(36),
  str VARCHAR(255),
  `int` INT,
  bol BOOLEAN,
  wen TIMESTAMP,
  mark VARCHAR(255),
  `dec` REAL,
  arr TEXT,
  obj TEXT,
  seneca VARCHAR(125)
);

CREATE TABLE products (
  id VARCHAR(36),
  label VARCHAR(255),
  price DECIMAL(11, 2)
);

CREATE TABLE users (
  id VARCHAR(36),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  username VARCHAR(255),
  points INT,
  skill INT
);

