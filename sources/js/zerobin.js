/**
 * ZeroBin 0.18
 *
 * @link http://sebsauvage.net/wiki/doku.php?id=php:zerobin
 * @author sebsauvage
 */

// Immediately start random number generator collector.
sjcl.random.startCollectors();

/**
 *  Converts a duration (in seconds) into human readable format.
 *
 *  @param int seconds
 *  @return string
 */
function secondsToHuman(seconds)
{
    if (seconds<60) { var v=Math.floor(seconds); return v+' second'+((v>1)?'s':''); }
    if (seconds<60*60) { var v=Math.floor(seconds/60); return v+' minute'+((v>1)?'s':''); }
    if (seconds<60*60*24) { var v=Math.floor(seconds/(60*60)); return v+' hour'+((v>1)?'s':''); }
    // If less than 2 months, display in days:
    if (seconds<60*60*24*60) { var v=Math.floor(seconds/(60*60*24)); return v+' day'+((v>1)?'s':''); }
    var v=Math.floor(seconds/(60*60*24*30)); return v+' month'+((v>1)?'s':'');
}

/**
 * Converts an associative array to an encoded string
 * for appending to the anchor.
 *
 * @param object associative_array Object to be serialized
 * @return string
 */
function hashToParameterString(associativeArray)
{
  var parameterString = ""
  for (key in associativeArray)
  {
    if( parameterString === "" )
    {
      parameterString = encodeURIComponent(key);
      parameterString += "=" + encodeURIComponent(associativeArray[key]);
    } else {
      parameterString += "&" + encodeURIComponent(key);
      parameterString += "=" + encodeURIComponent(associativeArray[key]);
    }
  }
  //padding for URL shorteners
  parameterString += "&p=p";
  
  return parameterString;
}

/**
 * Converts a string to an associative array.
 *
 * @param string parameter_string String containing parameters
 * @return object
 */
function parameterStringToHash(parameterString)
{
  var parameterHash = {};
  var parameterArray = parameterString.split("&");
  for (var i = 0; i < parameterArray.length; i++) {
    //var currentParamterString = decodeURIComponent(parameterArray[i]);
    var pair = parameterArray[i].split("=");
    var key = decodeURIComponent(pair[0]);
    var value = decodeURIComponent(pair[1]);
    parameterHash[key] = value;
  }
  
  return parameterHash;
}

/**
 * Get an associative array of the parameters found in the anchor
 *
 * @return object
 **/
function getParameterHash()
{
  var hashIndex = window.location.href.indexOf("#");
  if (hashIndex >= 0) {
    return parameterStringToHash(window.location.href.substring(hashIndex + 1));
  } else {
    return {};
  } 
}

/**
 * Compress a message (deflate compression). Returns base64 encoded data.
 *
 * @param string message
 * @return base64 string data
 */
function compress(message) {
    return Base64.toBase64( RawDeflate.deflate( Base64.utob(message) ) );
}

/**
 * Decompress a message compressed with compress().
 */
function decompress(data) {
    return Base64.btou( RawDeflate.inflate( Base64.fromBase64(data) ) );
}

/**
 * Compress, then encrypt message with key.
 *
 * @param string key
 * @param string message
 * @return encrypted string data
 */
function zeroCipher(key, message) {
    return sjcl.encrypt(key,compress(message));
}
/**
 *  Decrypt message with key, then decompress.
 *
 *  @param key
 *  @param encrypted string data
 *  @return string readable message
 */
function zeroDecipher(key, data) {
    return decompress(sjcl.decrypt(key,data));
}

/**
 * @return the current script location (without search or hash part of the URL).
 *   eg. http://server.com/zero/?aaaa#bbbb --> http://server.com/zero/
 */
function scriptLocation() {
  var scriptLocation = window.location.href.substring(0,window.location.href.length
    - window.location.search.length - window.location.hash.length);
  var hashIndex = scriptLocation.indexOf("#");
  if (hashIndex !== -1) {
    scriptLocation = scriptLocation.substring(0, hashIndex)
  }
  return scriptLocation
}

/**
 * @return the paste unique identifier from the URL
 *   eg. 'c05354954c49a487'
 */
function pasteID() {
    return window.location.search.substring(1);
}

/**
 * Set text of a DOM element (required for IE)
 * This is equivalent to element.text(text)
 * @param object element : a DOM element.
 * @param string text : the text to enter.
 */
function setElementText(element, text) {
    // For IE<10.
    if ($('div#oldienotice').is(":visible")) {
        // IE<10 do not support white-space:pre-wrap; so we have to do this BIG UGLY STINKING THING.
        element.text(text.replace(/\n/ig,'{BIG_UGLY_STINKING_THING__OH_GOD_I_HATE_IE}'));
        element.html(element.text().replace(/{BIG_UGLY_STINKING_THING__OH_GOD_I_HATE_IE}/ig,"\r\n<br>"));
    }
    // for other (sane) browsers:
    else {
        element.text(text);
    }
}

/**
 * Show decrypted text in the display area, including discussion (if open)
 *
 * @param string key : decryption key
 * @param array comments : Array of messages to display (items = array with keys ('data','meta')
 */
function displayMessages(key, comments) {
    try { // Try to decrypt the paste.
        var cleartext = JSON.parse(zeroDecipher(key, comments[0].data));
        
    } catch(err) {
        $('div#cleartext').hide();
        showError('Could not decrypt data (Wrong key ?)');
        return;
    }
    setElementText($('div#cleartext'), cleartext.data);
    var filename = comments[0].meta.filename;
    $('div#showfile').html(showFileDownload(cleartext.data, cleartext.filename)); // show DL link (or the image itself, based on mime type)

    // Display paste expiration.
    if (comments[0].meta.expire_date) $('div#remainingtime').removeClass('foryoureyesonly').text('This document will expire in '+secondsToHuman(comments[0].meta.remaining_time)+'.').show();
    if (comments[0].meta.burnafterreading) {
        $('div#remainingtime').addClass('foryoureyesonly').text('FOR YOUR EYES ONLY.  Don\'t close this window, this message can\'t be displayed again.').show();
    }
}



/**
 *  Send a new paste to server
 */
function send_data() {
    // Do not send if no data.
    if ($('textarea#message').val().length == 0) {
        return;
    }
    showStatus('Sending paste...', spin=true);
    var randomkey = sjcl.codec.base64.fromBits(sjcl.random.randomWords(8, 0), 0);
    var subJson = { data: $('textarea#message').val(), filename: $('input#filename').val() };
    var cipherdata = zeroCipher(randomkey, JSON.stringify(subJson));
    var data_to_send = { data:             cipherdata,
                         expire:           $('select#pasteExpiration').val(),
                         burnafterreading: $('input#burnafterreading').is(':checked') ? 1 : 0,
                       };
    $.post(scriptLocation(), data_to_send, 'json')
        .error(function() {
            showError('Data could not be sent (serveur error or not responding).');
        })
        .success(function(data) {
            if (data.status == 0) {
                stateExistingPaste();
                var url = scriptLocation() + "?" + data.id + '#' + randomkey;
                var deleteUrl = scriptLocation() + "?pasteid=" + data.id + '&deletetoken=' + data.deletetoken;
                showStatus('');

                $('div#pastelink').html('Your paste is <a id="pasteurl" href="' + url + '">' + url + '</a> <span id="copyhint">(Hit CTRL+C to copy)</span>');
                $('div#deletelink').html('<a href="' + deleteUrl + '">Delete link</a>');

                $('div#showfile').html(showFileDownload($('textarea#message').val(),$('input#filename').val())); // show DL link (or the image itself, based on mime type)

                $('div#pasteresult').show();
                selectText('pasteurl'); // We pre-select the link so that the user only has to CTRL+C the link.

                setElementText($('div#cleartext'), $('textarea#message').val());

                showStatus('');
            }
            else if (data.status==1) {
                showError('Could not create paste: '+data.message);
            }
            else {
                showError('Could not create paste.');
            }
        });
}


/** Text range selection.
 *  From: http://stackoverflow.com/questions/985272/jquery-selecting-text-in-an-element-akin-to-highlighting-with-your-mouse
 *  @param string element : Indentifier of the element to select (id="").
 */
function selectText(element) {
    var doc = document
        , text = doc.getElementById(element)
        , range, selection
    ;    
    if (doc.body.createTextRange) { //ms
        range = doc.body.createTextRange();
        range.moveToElementText(text);
        range.select();
    } else if (window.getSelection) { //all others
        selection = window.getSelection();        
        range = doc.createRange();
        range.selectNodeContents(text);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}
/**
 * Put the screen in "New paste" mode.
 */
function stateNewPaste() {
    $('button#sendbutton').show();
    $('button#rawtextbutton').hide();
    $('div#expiration').show();
    $('div#remainingtime').hide();
    $('div#burnafterreadingoption').show();
    $('button#newbutton').show();
    $('div#pasteresult').hide();
    $('textarea#message').text('');
    $('textarea#message').hide();
    $('div#cleartext').hide();
    $('div#sendfile').show();
    $('div#showfile').hide();

}

/**
 * Put the screen in "Existing paste" mode.
 */
function stateExistingPaste() {
    $('button#sendbutton').hide();
    $('button#rawtextbutton').show();
    $('div#expiration').hide();
    $('div#burnafterreadingoption').hide();
    $('button#newbutton').show();
    $('div#pasteresult').hide();
    $('textarea#message').hide();
    $('div#cleartext').hide();
    $('div#sendfile').hide();
    $('div#showfile').show();
}

/** Return raw text
  */
function rawText()
{
    history.pushState(document.title, document.title, 'document.txt');
    var paste = $('div#cleartext').text();
    var newDoc = document.open('text/plain', 'replace');
    newDoc.write(paste);
    newDoc.close();
}

/**
 * Create a new paste.
 */
function newPaste() {
    stateNewPaste();
    showStatus('');
    $('textarea#message').text('');
}

/**
 * Display an error message
 * (We use the same function for paste and reply to comments)
 */
function showError(message) {
    $('div#status').addClass('errorMessage').text(message);
    $('div#replystatus').addClass('errorMessage').text(message);
}

/**
 * Display status
 * (We use the same function for paste and reply to comments)
 *
 * @param string message : text to display
 * @param boolean spin (optional) : tell if the "spinning" animation should be displayed.
 */
function showStatus(message, spin) {
    $('div#replystatus').removeClass('errorMessage');
    $('div#replystatus').text(message);
    if (!message) {
        $('div#status').html('&nbsp;');
        return;
    }
    if (message == '') {
        $('div#status').html('&nbsp;');
        return;
    }
    $('div#status').removeClass('errorMessage');
    $('div#status').text(message);
    if (spin) {
        var img = '<img src="img/busy.gif" style="width:16px;height:9px;margin:0px 4px 0px 0px;" />';
        $('div#status').prepend(img);
        $('div#replystatus').prepend(img);
    }
}

/**
 * Return the deciphering key stored in anchor part of the URL
 */
function pageKey() {
    var key = window.location.hash.substring(1);  // Get key

    // Some stupid web 2.0 services and redirectors add data AFTER the anchor
    // (such as &utm_source=...).
    // We will strip any additional data.

    // First, strip everything after the equal sign (=) which signals end of base64 string.
    i = key.indexOf('='); if (i>-1) { key = key.substring(0,i+1); }

    // If the equal sign was not present, some parameters may remain:
    i = key.indexOf('&'); if (i>-1) { key = key.substring(0,i); }

    // Then add trailing equal sign if it's missing
    if (key.charAt(key.length-1)!=='=') key+='=';

    return key;
}

/**
 * Uses HTML fileReader to turn a selected file into BASE64 code
 * The code is then sent as text, in the "message" textarea
 */

function file2base64(files) {
	if (files[0]) file = files[0];
	var fr = new FileReader();
	fr.onload = function(d) {
      $('textarea#message').text(d.target.result);
   };
	fr.readAsDataURL(file);
   $('input#filename').val(file.name);
}

/**
 * Displays a link for the shared file (a base64 link).
 * In case of an image, displays the image.
 */
function showFileDownload(data, filename) {
   var reg = new RegExp("^data:image/","g");
   if (data.match(reg)) {
		return '<p class="datafile"><a href="'+data+'" download="'+filename+'" target="_blank"><img src="'+data+'" alt="alt" class="myimage" /></a></p>';
	}
   else return '<p class="datafile onlyfile"><a href="'+data+'" download="'+filename+'" target="_blank">Click to download <b>"'+filename+'</b>".</a></p>';
}

$(function() {

    // Display status returned by php code if any (eg. Paste was properly deleted.)
    if ($('div#status').text().length > 0) {
        showStatus($('div#status').text(),false);
        return;
    }

    $('div#status').html('&nbsp;'); // Keep line height even if content empty.

    // Display an existing paste
    if ($('div#cipherdata').text().length > 1) {
        // Missing decryption key in URL ?
        if (window.location.hash.length == 0) {
            showError('Cannot decrypt paste: Decryption key missing in URL (Did you use a redirector or an URL shortener which strips part of the URL ?)');
            return;
        }

        // List of messages to display
        var messages = jQuery.parseJSON($('div#cipherdata').text());

        // Show proper elements on screen.
        stateExistingPaste();

        displayMessages(pageKey(), messages);
    }
    // Display error message from php code.
    else if ($('div#errormessage').text().length>1) {
        showError($('div#errormessage').text());
    }
    // Create a new paste.
    else {
        newPaste();
    }
});
