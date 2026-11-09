export const missingEndpointMessage='ThingsBoard er ikke konfigurert. Angi TB_URL i .env og start SolarOps på nytt.';
export function loginErrorMessage(status:number,code?:string):string {
 if(code==='TB_URL_MISSING')return missingEndpointMessage;
 if(code==='TB_UNREACHABLE')return 'Kan ikke nå ThingsBoard-serveren. Kontroller at serveren kjører, nettverk/VPN og TB_URL i .env. Prøv deretter igjen.';
 if(code==='TB_UNAVAILABLE')return 'ThingsBoard-serveren svarer med en serverfeil. Prøv igjen senere eller kontroller ThingsBoard-serveren.';
 if(status===401)return 'Brukernavn eller passord ble ikke godkjent.';
 if(status===403)return 'ThingsBoard-kontoen har ikke nødvendig tilgang.';
 if(status===429)return 'For mange innloggingsforsøk. Prøv igjen senere.';
 if(status===0)return 'Kan ikke nå SolarOps-serveren. Kontroller at SolarOps kjører og prøv igjen.';
 return 'Innlogging mislyktes. Kontroller tilkobling og påloggingsinformasjon.';
}
