'use strict';

const Libingester = require('libingester');
const FeedParser = require('feedparser-promised');
const URLParse = require('url-parse');

const rss_uri = "http://www.alodita.com/rss.xml";

//Doesn´t support images
const hosts_drop_images = [
    'i1211.photobucket.com',
];

//remove attributes from image
const remove_attrs_img = [
    'border',
    'class',
    'id',
    'src',
];

//Remove elements
const remove_elements = [
    'br + br + br',
    'a[name="more"]',
    'a[href="http://photobucket.com/"]',
    'center',
    'iframe',
    'noscript', //any script injection
    'script', //any script injection
    '.instagram-media'
];

function ingest_article_blog(hatch,item){
     return Libingester.util.fetch_html(item.link).then(($profile) => {
       let base_uri = Libingester.util.get_doc_base_uri($profile, item.link);
       let asset = new Libingester.BlogArticle();
       let modified_date = new Date(Date.parse(item.pubdate));
       let article_entry = $profile('.post .post-heading .meta').first();
       let synopsis = $profile('meta[property="og:description"]').attr('content');
       let body = $profile('.post-body').first();
       let date_published = item.date;
       let thumb_uri = $profile('meta[property="og:image"]').attr('content');

       let thumb_asset;
       if(thumb_uri){
          thumb_asset = Libingester.util.download_image(thumb_uri);
          thumb_asset.set_title(item.title);
          hatch.save_asset(thumb_asset);
       }

        //remove main image from body
        $profile('.post-body img').first().remove();

         // Download images
        body.find('img').map(function() { // Put images in <figure>
            if($profile(this).parent().parent()[0].attribs.class == 'separator')
            {
              let parent= $profile(this).parent().parent();
              let figure = $profile('<figure></figure>');
              parent.replaceWith(figure);
              $profile(figure).append($profile(this));
            }
        });

        // download images
        body.find('img').map(function() {
            let img = $profile('<figure></figure>').append($profile(this).clone());
            const image = Libingester.util.download_img($profile(img.children()[0]));
            $profile(this).replaceWith(img);
            image.set_title(item.title);
            hatch.save_asset(image);
        });

        // download video
        body.find('iframe').map(function() {
            const src = this.attribs.src;
            if (src.includes("youtube")) {
                const video = Libingester.util.get_embedded_video_asset($profile(this), src);
                video.set_title(item.title);
                hatch.save_asset(video);
            }
        });

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        asset.set_canonical_uri(item.link);
        asset.set_last_modified_date(modified_date);
        asset.set_title(item.title);
        asset.set_synopsis(synopsis);
        asset.set_thumbnail(thumb_asset);
        asset.set_main_image(thumb_asset);
        asset.set_author(item.author);
        asset.set_date_published(date_published);
        asset.set_license('Proprietary');
        asset.set_body(body);
        asset.set_tags(item.categories);
        asset.set_read_more_text("Artikel asli di http://www.alodita.com/");
        asset.set_custom_scss(`
            $primary-light-color: #E0216E;
            $primary-medium-color: #4C4C4C;
            $primary-dark-color: #1A1A1A;
            $accent-light-color: #FF5298;
            $accent-dark-color: #B51656;
            $background-light-color: #EEEEEE;
            $background-dark-color: #E3E3E3;
            $title-font: 'Josefin Sans';
            $body-font: 'Lora';
            $display-font: 'Josefin Sans';
            $logo-font: 'Josefin Sans';
            $context-font: 'Josefin Sans';
            $support-font: 'Josefin Sans';
            @import '_default';
        `);
        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log(err,item.link);
    })
}

function main() {
    const hatch = new Libingester.Hatch('alodita', 'id');
    FeedParser.parse(rss_uri)
    .then((items) => {
       return Promise.all(items.map((item) => ingest_article_blog(hatch, item)));
    })
    .then(() => hatch.finish())
    .catch( (error) => {
       console.log('error: ', error);
  });
}

main();
