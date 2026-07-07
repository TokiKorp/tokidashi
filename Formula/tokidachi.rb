cask "tokidachi" do
  version "0.1.0" # This will be dynamically updated by the release workflow
  sha256 :no_check # This will be dynamically updated by the release workflow

  url "https://github.com/oncleguigs/tokidachi/releases/download/v#{version}/Tokidachi_#{version}_universal.dmg"
  name "Tokidachi"
  desc "Desktop companion idle + care (Tauri App)"
  homepage "https://github.com/oncleguigs/tokidachi"

  app "Tokidachi.app"

  zap trash: [
    "~/Library/Application Support/fr.guillaume.tokidachi",
    "~/Library/Preferences/fr.guillaume.tokidachi.plist",
    "~/Library/Saved Application State/fr.guillaume.tokidachi.savedState",
  ]
end
