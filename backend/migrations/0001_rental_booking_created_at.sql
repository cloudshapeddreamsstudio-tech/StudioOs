-- The old app stamped `createdAt` on a booking at creation. The initial schema
-- omitted it because none of the *existing* bookings in studioRental.json carry
-- one — they predate the field. New bookings should still record it.
--
-- Nullable on purpose: back-filling a creation date for the two historical
-- bookings would mean inventing one, and this project does not invent data.

ALTER TABLE rental_bookings ADD COLUMN created_at TEXT;
