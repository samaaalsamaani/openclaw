# Router-Level Block Troubleshooting Guide

**Issue**: OpenAI API blocked at router level
**Date**: February 27, 2026

---

## 🎯 Confirmed Problem

Your **router is blocking OpenAI API** specifically while allowing other services. This is likely:

- Parental controls
- Content filtering (OpenDNS Family Shield, Circle, etc.)
- AI service blocking
- ISP-provided router with restrictions

---

## 🔧 Step-by-Step Fix

### Step 1: Access Your Router Admin Panel

Your router is at: **192.168.68.1**

1. Open browser and go to: **http://192.168.68.1**
2. Login credentials (common defaults):
   - Username: `admin` / Password: `admin`
   - Username: `admin` / Password: `password`
   - Check router label/manual for actual credentials

### Step 2: Check for Parental Controls

Look for these sections in router settings:

- **Parental Controls**
- **Content Filtering**
- **Website Blocking**
- **Firewall Rules**
- **Access Control**
- **Security Settings**

### Step 3: Check DNS Settings

Your router might be using filtering DNS:

- **Current DNS**: 1.1.1.1, 8.8.8.8, 8.8.4.4
- **Problem**: OpenDNS Family Shield (208.67.222.123) blocks AI services

**What to check:**

1. Go to router's **Internet/WAN settings**
2. Look for **DNS Server** configuration
3. Check if using:
   - ❌ OpenDNS Family Shield (208.67.222.123, 208.67.220.123)
   - ❌ CleanBrowsing (185.228.168.9)
   - ❌ AdGuard Family (94.140.14.15)
   - ✅ Google DNS (8.8.8.8, 8.8.4.4) - Should be safe
   - ✅ Cloudflare (1.1.1.1, 1.0.0.1) - Should be safe

### Step 4: Check for Device-Specific Rules

Some routers allow per-device blocking:

1. Find **Device Management** or **Connected Devices**
2. Look for your Mac (IP: 192.168.68.56)
3. Check if there are **restrictions** or **access schedules** applied

### Step 5: Check Firewall Rules

1. Go to **Firewall** or **Security** section
2. Look for **Blocked Websites** or **URL Filter**
3. Search for entries containing:
   - `openai.com`
   - `*.openai.com`
   - `api.openai.com`
   - Cloudflare IP ranges (162.159.x.x)

### Step 6: Disable Content Filtering (Temporarily)

To test if content filtering is the issue:

1. Find **Enable/Disable toggle** for content filtering
2. **Temporarily disable** it
3. Test OpenAI API: `curl -I https://api.openai.com`
4. If works → Re-enable and add OpenAI to whitelist

---

## 🔍 Common Router Blocking Features

### Google WiFi / Nest WiFi

- **Family WiFi** feature blocks adult content and can block AI services
- **SafeSearch** enforcement
- **Site blocking** by category
- **Fix**: Google Home app → Wi-Fi → Family Wi-Fi → Disable or whitelist

### Netgear Routers

- **OpenDNS integration** (often enabled by default)
- **Circle with Disney** parental controls
- **Armor Security** might block AI services
- **Fix**: Router admin → Advanced → Security → Disable or configure

### TP-Link Routers

- **Parental Controls** with time/website restrictions
- **Access Control** blocking specific devices
- **IP/Domain Filters** might block OpenAI
- **Fix**: Advanced → Access Control → Parental Controls

### Asus Routers

- **AiProtection** blocks malicious and adult sites
- **Parental Controls** with category blocking
- **Two-Way IPS** might flag AI APIs
- **Fix**: AiProtection → Turn off or whitelist

### ISP-Provided Routers (Comcast, AT&T, etc.)

- Often have **built-in content filtering**
- **Xfinity xFi** has parental controls
- **AT&T Smart Home Manager** has content filtering
- **Fix**: ISP mobile app or call ISP support

---

## 🧪 Quick Tests

### Test 1: Check Current DNS

```bash
scutil --dns | grep nameserver
```

**Expected:** Should show your DNS servers
**If different:** Router might be intercepting DNS

### Test 2: Try Direct IP Connection

```bash
curl -I https://162.159.140.245
```

**If fails:** IP-level blocking (not just DNS)
**If works:** DNS filtering only

### Test 3: Test with Mobile Hotspot

1. Enable mobile hotspot on your phone
2. Connect Mac to phone's hotspot
3. Test: `curl -I https://api.openai.com`

**If works:** Confirms router blocking
**If fails:** System or ISP-level block

### Test 4: Check Router Model

```bash
arp -a | grep "192.168.68.1"
```

This shows router's MAC address. Look up the vendor.

---

## 🔄 Alternative Solutions

### Option A: Use VPN (Bypass Router Block)

```bash
# Install OpenVPN, WireGuard, or commercial VPN
# This routes traffic around router restrictions
```

**Pros:** Works immediately
**Cons:** Adds latency, costs money, all traffic goes through VPN

### Option B: Change DNS Locally (Partial Fix)

```bash
# Override router DNS on your Mac only
sudo networksetup -setdnsservers Ethernet 8.8.8.8 8.8.4.4
```

**Pros:** Quick to try
**Cons:** Won't work if router blocks by IP (which it does)

### Option C: DMZ Your Mac (Last Resort)

In router settings:

1. Find **DMZ** (Demilitarized Zone)
2. Set DMZ host to: 192.168.68.56 (your Mac)

**Pros:** Bypasses all router filtering
**Cons:** Less secure, exposes Mac to internet

### Option D: Use OpenRouter (No Router Changes)

Add to `models.json`:

```json
{
  "providers": {
    "openrouter": {
      "models": [
        {
          "id": "openai/gpt-4-turbo",
          "name": "GPT-4 Turbo",
          "cost": { "input": 3.0, "output": 12.0 }
        }
      ]
    }
  }
}
```

**Pros:** Works right now, no network changes
**Cons:** 10-30% markup, router still blocks direct access

---

## 📋 Troubleshooting Checklist

- [ ] **Accessed router admin panel** (http://192.168.68.1)
- [ ] **Checked parental controls** (disabled or whitelisted OpenAI)
- [ ] **Checked DNS settings** (not using filtering DNS)
- [ ] **Checked firewall rules** (no OpenAI blocks)
- [ ] **Checked device restrictions** (Mac not restricted)
- [ ] **Tested with mobile hotspot** (confirmed router is the issue)
- [ ] **Documented router model/firmware** (for future reference)
- [ ] **Created OpenAI whitelist** (if router supports it)
- [ ] **Re-tested API access** (`curl -I https://api.openai.com`)
- [ ] **Updated models.json** (added OpenAI provider)

---

## 🆘 If You Can't Access Router

### Contact Network Admin

If this is a work/school/managed network:

- Contact IT department
- Request OpenAI API whitelist
- Provide business justification ($100/month subscription)

### Contact ISP

If ISP-provided router with locked settings:

- Call ISP support
- Request content filtering disable
- OR request different router/modem

### Use Different Network

As temporary solution:

- Mobile hotspot
- Coffee shop WiFi
- Library WiFi
- Friend's network

---

## ✅ Success Indicators

Once fixed, you should see:

```bash
$ curl -I https://api.openai.com
HTTP/2 200
date: Fri, 27 Feb 2026 10:00:00 GMT
content-type: application/json
```

And Python test should show:

```
✅ Connection successful!
📊 Total Models Available: 50+
🤖 GPT-4 Family Models: [list of models]
```

---

## 📞 Support Resources

- **Router Manual**: Google "[router model] manual"
- **OpenAI Status**: https://status.openai.com
- **Network Test**: https://fast.com (check if internet works)
- **DNS Test**: https://1.1.1.1/help (check DNS resolution)

---

**Next Action**: Access your router at http://192.168.68.1 and check parental controls/content filtering settings.
