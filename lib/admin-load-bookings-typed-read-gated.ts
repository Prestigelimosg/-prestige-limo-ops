import "server-only";

import {
  buildAdminLoadBookingsOperationalRecordMapper,
  type AdminLoadBookingsOperationalRecordMapperResult,
} from "./admin-load-bookings-operational-record-mapper";

export const adminLoadBookingsTypedReadGatedVersion =
  "admin-load-bookings-typed-read-gated-v1";

export const adminLoadBookingsTypedReadEnabledEnvName =
  "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED";

export type AdminLoadBookingsTypedReadMode = "list" | "detail";

export type AdminLoadBookingsTypedReadSafeBooking = {
  quarantined_field_count: number;
  safe_card: AdminLoadBookingsOperationalRecordMapperResult["safe_card"];
  safe_dto: AdminLoadBookingsOperationalRecordMapperResult["safe_dto"];
};

export type AdminLoadBookingsTypedReadMappedList = {
  bookings: AdminLoadBookingsTypedReadSafeBooking[];
  mode: "list";
  ok: true;
  rejected_fields: string[];
};

export type AdminLoadBookingsTypedReadMappedDetail = {
  booking: AdminLoadBookingsTypedReadSafeBooking | null;
  mode: "detail";
  ok: true;
  rejected_fields: string[];
};

export type AdminLoadBookingsTypedReadMappedFailure = {
  error: "unsafe_typed_read_record";
  mode: AdminLoadBookingsTypedReadMode;
  ok: false;
  rejected_fields: string[];
};

export type AdminLoadBookingsTypedReadMappedResult =
  | AdminLoadBookingsTypedReadMappedDetail
  | AdminLoadBookingsTypedReadMappedFailure
  | AdminLoadBookingsTypedReadMappedList;

export type AdminLoadBookingsTypedReadGateState = {
  appPageRuntimeWiringEnabled: false;
  app_page_runtime_wiring_enabled: false;
  databaseClientEnabled: boolean;
  database_client_enabled: boolean;
  dbReadEnabled: boolean;
  db_read_enabled: boolean;
  delivery_surface: "load_bookings_typed_read_gated_endpoint";
  endpointChanged: false;
  endpoint_changed: false;
  env_gate_name: typeof adminLoadBookingsTypedReadEnabledEnvName;
  legacyClientEnabled: false;
  legacy_client_enabled: false;
  liveReadEnabled: boolean;
  liveWriteEnabled: false;
  live_read_enabled: boolean;
  live_write_enabled: false;
  loadBookingsEndpointChanged: false;
  loadBookingsRuntimeWiringEnabled: false;
  load_bookings_endpoint_changed: false;
  load_bookings_runtime_wiring_enabled: false;
  no_live_read: boolean;
  no_op: boolean;
  parserChanged: false;
  parser_changed: false;
  readEnabled: boolean;
  read_enabled: boolean;
  read_gate_open: boolean;
  reason: "gate_closed" | "gate_open";
  saveBookingChanged: false;
  save_booking_changed: false;
  savedBookingsEndpointChanged: false;
  saved_bookings_endpoint_changed: false;
  typedEndpointRuntimeWiringEnabled: false;
  typed_endpoint_runtime_wiring_enabled: false;
  version: typeof adminLoadBookingsTypedReadGatedVersion;
  writeEnabled: false;
  write_enabled: false;
};

function envGateOpen() {
  return process.env[adminLoadBookingsTypedReadEnabledEnvName] === "true";
}

export function buildAdminLoadBookingsTypedReadGateState(): AdminLoadBookingsTypedReadGateState {
  const readGateOpen = envGateOpen();

  return {
    appPageRuntimeWiringEnabled: false,
    app_page_runtime_wiring_enabled: false,
    databaseClientEnabled: readGateOpen,
    database_client_enabled: readGateOpen,
    dbReadEnabled: readGateOpen,
    db_read_enabled: readGateOpen,
    delivery_surface: "load_bookings_typed_read_gated_endpoint",
    endpointChanged: false,
    endpoint_changed: false,
    env_gate_name: adminLoadBookingsTypedReadEnabledEnvName,
    legacyClientEnabled: false,
    legacy_client_enabled: false,
    liveReadEnabled: readGateOpen,
    liveWriteEnabled: false,
    live_read_enabled: readGateOpen,
    live_write_enabled: false,
    loadBookingsEndpointChanged: false,
    loadBookingsRuntimeWiringEnabled: false,
    load_bookings_endpoint_changed: false,
    load_bookings_runtime_wiring_enabled: false,
    no_live_read: !readGateOpen,
    no_op: !readGateOpen,
    parserChanged: false,
    parser_changed: false,
    readEnabled: readGateOpen,
    read_enabled: readGateOpen,
    read_gate_open: readGateOpen,
    reason: readGateOpen ? "gate_open" : "gate_closed",
    saveBookingChanged: false,
    save_booking_changed: false,
    savedBookingsEndpointChanged: false,
    saved_bookings_endpoint_changed: false,
    typedEndpointRuntimeWiringEnabled: false,
    typed_endpoint_runtime_wiring_enabled: false,
    version: adminLoadBookingsTypedReadGatedVersion,
    writeEnabled: false,
    write_enabled: false,
  };
}

function safeBookingFromMapper(
  mapped: AdminLoadBookingsOperationalRecordMapperResult,
): AdminLoadBookingsTypedReadSafeBooking {
  return {
    quarantined_field_count: mapped.quarantined_field_names.length,
    safe_card: mapped.safe_card,
    safe_dto: mapped.safe_dto,
  };
}

function rejectedFieldsFrom(mappers: AdminLoadBookingsOperationalRecordMapperResult[]) {
  return [
    ...new Set(mappers.flatMap((mapper) => mapper.rejected_fields)),
  ].sort();
}

export function mapAdminLoadBookingsTypedReadList(
  records: unknown[],
): AdminLoadBookingsTypedReadMappedFailure | AdminLoadBookingsTypedReadMappedList {
  const mappers = records.map((record) =>
    buildAdminLoadBookingsOperationalRecordMapper(record as Record<string, unknown>),
  );
  const rejectedFields = rejectedFieldsFrom(mappers);

  if (rejectedFields.length > 0) {
    return {
      error: "unsafe_typed_read_record",
      mode: "list",
      ok: false,
      rejected_fields: rejectedFields,
    };
  }

  return {
    bookings: mappers.map(safeBookingFromMapper),
    mode: "list",
    ok: true,
    rejected_fields: [],
  };
}

export function mapAdminLoadBookingsTypedReadDetail(
  record: unknown,
): AdminLoadBookingsTypedReadMappedDetail | AdminLoadBookingsTypedReadMappedFailure {
  if (!record) {
    return {
      booking: null,
      mode: "detail",
      ok: true,
      rejected_fields: [],
    };
  }

  const mapped = buildAdminLoadBookingsOperationalRecordMapper(record as Record<string, unknown>);

  if (!mapped.ok) {
    return {
      error: "unsafe_typed_read_record",
      mode: "detail",
      ok: false,
      rejected_fields: mapped.rejected_fields,
    };
  }

  return {
    booking: safeBookingFromMapper(mapped),
    mode: "detail",
    ok: true,
    rejected_fields: [],
  };
}
