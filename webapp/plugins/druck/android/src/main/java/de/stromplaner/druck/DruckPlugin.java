package de.stromplaner.druck;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Druckt ein HTML-Dokument über das Android-Drucksystem. Im Druckdialog lässt sich „Als PDF speichern“
 * oder ein Drucker wählen. Gerendert wird mit derselben Chromium-Engine wie am PC (Electron printToPDF),
 * das PDF enthält also echten, markierbaren Text.
 */
@CapacitorPlugin(name = "Druck")
public class DruckPlugin extends Plugin {

    // Die WebView muss leben, bis der Druckdialog das Dokument gerendert hat
    private WebView druckView;

    @PluginMethod
    public void html(PluginCall call) {
        String html = call.getString("html");
        String name = call.getString("name", "Dokument");
        if (html == null || html.isEmpty()) {
            call.reject("Kein Inhalt zum Drucken");
            return;
        }
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getActivity());
            view.getSettings().setJavaScriptEnabled(false);
            view.setWebViewClient(new WebViewClient() {
                private boolean gestartet = false;

                @Override
                public void onPageFinished(WebView v, String url) {
                    if (gestartet) return;
                    gestartet = true;
                    try {
                        PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = v.createPrintDocumentAdapter(name);
                        PrintAttributes attr = new PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                            .build();
                        pm.print(name, adapter, attr);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Drucken nicht möglich: " + e.getMessage(), e);
                    }
                }
            });
            druckView = view;
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
