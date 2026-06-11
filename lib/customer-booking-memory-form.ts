import {
  applyCustomerBookingMemorySuggestion,
  type CustomerBookingMemorySuggestion,
  type CustomerBookingRequestMemoryForm,
} from "./customer-booking-memory-adapter";

export function findCustomerBookingMemorySuggestion(
  suggestions: CustomerBookingMemorySuggestion[],
  passengerName: string,
) {
  const normalizedPassengerName = passengerName.trim().toLowerCase();

  return suggestions.find(
    (suggestion) => suggestion.passengerName.trim().toLowerCase() === normalizedPassengerName,
  );
}

export function applyCustomerBookingMemoryToRequestForm<T extends CustomerBookingRequestMemoryForm>({
  form,
  serviceOptions,
  suggestion,
  vehicleOptions,
}: {
  form: T;
  serviceOptions: string[];
  suggestion: CustomerBookingMemorySuggestion;
  vehicleOptions: string[];
}): T {
  const nextForm = applyCustomerBookingMemorySuggestion(form, suggestion);

  return {
    ...nextForm,
    serviceType: serviceOptions.includes(nextForm.serviceType)
      ? nextForm.serviceType
      : form.serviceType,
    vehicleType:
      !nextForm.vehicleType || vehicleOptions.includes(nextForm.vehicleType)
        ? nextForm.vehicleType
        : form.vehicleType,
  };
}
