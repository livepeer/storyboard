# Homebrew Formula template for livepeer-agent.
#
# This is the canonical formula content. To ship to homebrew-tap:
# 1. Tag a release on storyboard-a3 (e.g. v1.0.0-rc.1)
# 2. The release CI builds platform binaries and uploads them as release assets
#    using `bun build src/cli/index.ts --compile --outfile dist/livepeer`
#    per target triple (darwin-arm64, darwin-x64, linux-x64)
# 3. The CI computes SHA256 of each asset
# 4. A separate PR to livepeer/homebrew-tap installs this file with SHA256s filled in
#
# Until then this file lives in storyboard-a3 as documentation.
# DO NOT push this file to homebrew-tap until the SHA256s are known.

class LivepeerAgent < Formula
  desc "Livepeer agent SDK CLI — multi-provider agent for creative AI workflows"
  homepage "https://github.com/livepeer/storyboard"
  version "1.0.0-rc.1"

  on_macos do
    on_arm do
      url "https://github.com/livepeer/storyboard/releases/download/v#{version}/livepeer-agent-#{version}-darwin-arm64.tar.gz"
      sha256 "TBD-after-first-release"
    end
    on_intel do
      url "https://github.com/livepeer/storyboard/releases/download/v#{version}/livepeer-agent-#{version}-darwin-x64.tar.gz"
      sha256 "TBD-after-first-release"
    end
  end

  on_linux do
    url "https://github.com/livepeer/storyboard/releases/download/v#{version}/livepeer-agent-#{version}-linux-x64.tar.gz"
    sha256 "TBD-after-first-release"
  end

  def install
    bin.install "livepeer"
  end

  test do
    assert_match "livepeer", shell_output("#{bin}/livepeer --version")
  end
end
